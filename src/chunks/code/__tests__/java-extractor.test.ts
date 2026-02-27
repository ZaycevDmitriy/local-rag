import { describe, it, expect } from 'vitest';
import { extractNodes } from '../java-extractor.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockNode = any;

// Фабрика мок-нод для тестирования без реального tree-sitter.
function mockNode(overrides: Partial<{
  type: string;
  text: string;
  children: MockNode[];
  startPosition: { row: number };
  endPosition: { row: number };
  childForFieldName: (name: string) => MockNode | null;
  parent: MockNode;
}>): MockNode {
  return {
    type: 'unknown',
    text: '',
    children: [],
    startPosition: { row: 0 },
    endPosition: { row: 0 },
    childForFieldName: () => null,
    parent: null,
    ...overrides,
  };
}

// Создаёт mock identifier-ноду с текстом.
function mockIdent(text: string, row = 0): MockNode {
  return mockNode({ type: 'identifier', text, startPosition: { row }, endPosition: { row } });
}

// Создаёт mock программы (корневой узел) с заданными children и source text.
function mockProgram(children: MockNode[], sourceText: string): MockNode {
  const program = mockNode({
    type: 'program',
    text: sourceText,
    children,
    startPosition: { row: 0 },
    endPosition: { row: sourceText.split('\n').length - 1 },
  });
  for (const child of children) {
    child.parent = program;
  }
  return program;
}

// Создаёт mock class_declaration с телом и методами.
function mockClassDecl(params: {
  name: string;
  startRow: number;
  endRow: number;
  text: string;
  bodyChildren?: MockNode[];
  type?: string;
}): MockNode {
  const { name, startRow, endRow, text, bodyChildren = [], type = 'class_declaration' } = params;
  const nameNode = mockIdent(name, startRow);

  const classBody = mockNode({
    type: 'class_body',
    children: bodyChildren,
    startPosition: { row: startRow },
    endPosition: { row: endRow },
  });

  const cls = mockNode({
    type,
    text,
    startPosition: { row: startRow },
    endPosition: { row: endRow },
    childForFieldName: (f: string) => {
      if (f === 'name') return nameNode;
      if (f === 'body') return classBody;
      return null;
    },
    children: [classBody],
  });

  classBody.parent = cls;
  for (const child of bodyChildren) {
    child.parent = classBody;
  }

  return cls;
}

// Создаёт mock method_declaration.
function mockMethodDecl(params: {
  name: string;
  startRow: number;
  endRow: number;
  text: string;
  type?: string;
}): MockNode {
  const { name, startRow, endRow, text, type = 'method_declaration' } = params;
  const nameNode = mockIdent(name, startRow);

  return mockNode({
    type,
    text,
    startPosition: { row: startRow },
    endPosition: { row: endRow },
    childForFieldName: (f: string) => f === 'name' ? nameNode : null,
    children: [],
  });
}

describe('java-extractor', () => {
  describe('extractNodes', () => {
    it('пустой файл возвращает []', () => {
      const root = mockProgram([], '');
      expect(extractNodes(root)).toEqual([]);
    });

    it('файл без классов возвращает []', () => {
      const root = mockProgram([
        mockNode({ type: 'import_declaration', text: 'import java.util.List;' }),
      ], 'import java.util.List;');
      expect(extractNodes(root)).toEqual([]);
    });

    it('класс без методов → один CLASS чанк', () => {
      const source = 'public class MyService {}';
      const cls = mockClassDecl({ name: 'MyService', startRow: 0, endRow: 0, text: source });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('CLASS');
      expect(result[0]!.fqn).toBe('MyService');
      expect(result[0]!.startLine).toBe(1);
      expect(result[0]!.endLine).toBe(1);
    });

    it('класс с методами → CLASS + METHOD чанки', () => {
      const source = [
        'public class MyService {',
        '  public void doWork() {}',
        '  public String getResult() { return ""; }',
        '}',
      ].join('\n');

      const doWork = mockMethodDecl({ name: 'doWork', startRow: 1, endRow: 1, text: '  public void doWork() {}' });
      const getResult = mockMethodDecl({ name: 'getResult', startRow: 2, endRow: 2, text: '  public String getResult() { return ""; }' });
      const cls = mockClassDecl({
        name: 'MyService', startRow: 0, endRow: 3, text: source,
        bodyChildren: [doWork, getResult],
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(3);

      const classChunk = result.find(n => n.fragmentType === 'CLASS');
      expect(classChunk).toBeDefined();
      expect(classChunk!.fqn).toBe('MyService');

      const methodFqns = result.filter(n => n.fragmentType === 'METHOD').map(n => n.fqn);
      expect(methodFqns).toContain('MyService.doWork');
      expect(methodFqns).toContain('MyService.getResult');
    });

    it('record → CLASS (subtype: RECORD)', () => {
      const source = 'public record Point(int x, int y) {}';
      const cls = mockClassDecl({
        name: 'Point', startRow: 0, endRow: 0, text: source,
        type: 'record_declaration',
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('CLASS');
      expect(result[0]!.fragmentSubtype).toBe('RECORD');
      expect(result[0]!.fqn).toBe('Point');
    });

    it('interface → INTERFACE без subtype', () => {
      const source = 'public interface MyInterface {}';
      const nameNode = mockIdent('MyInterface');
      const cls = mockNode({
        type: 'interface_declaration',
        text: source,
        startPosition: { row: 0 },
        endPosition: { row: 0 },
        childForFieldName: (f: string) => f === 'name' ? nameNode : null,
        children: [],
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('INTERFACE');
      expect(result[0]!.fragmentSubtype).toBeUndefined();
      expect(result[0]!.fqn).toBe('MyInterface');
    });

    it('annotation type → INTERFACE (subtype: ANNOTATION_TYPE)', () => {
      const source = 'public @interface MyAnnotation {}';
      const nameNode = mockIdent('MyAnnotation');
      const cls = mockNode({
        type: 'annotation_type_declaration',
        text: source,
        startPosition: { row: 0 },
        endPosition: { row: 0 },
        childForFieldName: (f: string) => f === 'name' ? nameNode : null,
        children: [],
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('INTERFACE');
      expect(result[0]!.fragmentSubtype).toBe('ANNOTATION_TYPE');
    });

    it('enum → ENUM', () => {
      const source = 'public enum Status { ACTIVE, INACTIVE }';
      const nameNode = mockIdent('Status');
      const cls = mockNode({
        type: 'enum_declaration',
        text: source,
        startPosition: { row: 0 },
        endPosition: { row: 0 },
        childForFieldName: (f: string) => f === 'name' ? nameNode : null,
        children: [],
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('ENUM');
      expect(result[0]!.fqn).toBe('Status');
    });

    it('package → FQN включает package prefix', () => {
      const source = [
        'package com.example;',
        'public class MyService {',
        '  public void doWork() {}',
        '}',
      ].join('\n');

      // Mock package_declaration с scoped_identifier.
      const scopedId = mockNode({ type: 'scoped_identifier', text: 'com.example' });
      const packageDecl = mockNode({
        type: 'package_declaration',
        text: 'package com.example;',
        children: [
          mockNode({ type: 'package', text: 'package' }),
          scopedId,
          mockNode({ type: ';', text: ';' }),
        ],
      });

      const doWork = mockMethodDecl({ name: 'doWork', startRow: 2, endRow: 2, text: '  public void doWork() {}' });
      const cls = mockClassDecl({
        name: 'MyService', startRow: 1, endRow: 3, text: source.split('\n').slice(1).join('\n'),
        bodyChildren: [doWork],
      });
      const root = mockProgram([packageDecl, cls], source);

      const result = extractNodes(root);

      const classChunk = result.find(n => n.fragmentType === 'CLASS');
      expect(classChunk!.fqn).toBe('com.example.MyService');

      const methodChunk = result.find(n => n.fragmentType === 'METHOD');
      expect(methodChunk!.fqn).toBe('com.example.MyService.doWork');
    });

    it('package с простым identifier → FQN с именем пакета', () => {
      const source = 'package myapp;\npublic class Foo {}';
      const identNode = mockNode({ type: 'identifier', text: 'myapp' });
      const packageDecl = mockNode({
        type: 'package_declaration',
        text: 'package myapp;',
        children: [mockNode({ type: 'package', text: 'package' }), identNode],
      });
      const cls = mockClassDecl({ name: 'Foo', startRow: 1, endRow: 1, text: 'public class Foo {}' });
      const root = mockProgram([packageDecl, cls], source);

      const result = extractNodes(root);
      expect(result[0]!.fqn).toBe('myapp.Foo');
    });

    it('без package → FQN без prefix', () => {
      const source = 'public class Standalone {}';
      const cls = mockClassDecl({ name: 'Standalone', startRow: 0, endRow: 0, text: source });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result[0]!.fqn).toBe('Standalone');
    });

    it('Javadoc (block_comment) перед классом → startLine расширен, текст включает Javadoc', () => {
      const source = [
        '/** Javadoc для класса. */',
        'public class MyService {}',
      ].join('\n');

      const javadocNode = mockNode({
        type: 'block_comment',
        text: '/** Javadoc для класса. */',
        startPosition: { row: 0 },
        endPosition: { row: 0 },
      });
      const cls = mockClassDecl({
        name: 'MyService', startRow: 1, endRow: 1, text: 'public class MyService {}',
      });
      const root = mockProgram([javadocNode, cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      // startLine расширен до Javadoc.
      expect(result[0]!.startLine).toBe(1);
      expect(result[0]!.endLine).toBe(2);
      // Текст включает Javadoc.
      expect(result[0]!.text).toContain('/** Javadoc');
      expect(result[0]!.text).toContain('public class MyService');
    });

    it('line_comment перед классом → startLine расширен', () => {
      const source = [
        '// Комментарий.',
        'public class MyService {}',
      ].join('\n');

      const lineComment = mockNode({
        type: 'line_comment',
        text: '// Комментарий.',
        startPosition: { row: 0 },
        endPosition: { row: 0 },
      });
      const cls = mockClassDecl({
        name: 'MyService', startRow: 1, endRow: 1, text: 'public class MyService {}',
      });
      const root = mockProgram([lineComment, cls], source);

      const result = extractNodes(root);
      expect(result[0]!.startLine).toBe(1);
      expect(result[0]!.text).toContain('// Комментарий.');
    });

    it('конструктор → METHOD (subtype: CONSTRUCTOR)', () => {
      const source = [
        'public class MyService {',
        '  public MyService() {}',
        '}',
      ].join('\n');

      const ctor = mockMethodDecl({
        name: 'MyService', startRow: 1, endRow: 1,
        text: '  public MyService() {}',
        type: 'constructor_declaration',
      });
      const cls = mockClassDecl({
        name: 'MyService', startRow: 0, endRow: 2, text: source,
        bodyChildren: [ctor],
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);

      const ctorChunk = result.find(n => n.fragmentSubtype === 'CONSTRUCTOR');
      expect(ctorChunk).toBeDefined();
      expect(ctorChunk!.fragmentType).toBe('METHOD');
      expect(ctorChunk!.fqn).toBe('MyService.MyService');
    });

    it('nested class methods → FQN Outer.Inner.innerMethod', () => {
      const source = [
        'public class Outer {',
        '  class Inner {',
        '    void innerMethod() {}',
        '  }',
        '}',
      ].join('\n');

      const innerMethod = mockMethodDecl({
        name: 'innerMethod', startRow: 2, endRow: 2, text: '    void innerMethod() {}',
      });
      const innerClass = mockClassDecl({
        name: 'Inner', startRow: 1, endRow: 3, text: source.split('\n').slice(1, 4).join('\n'),
        bodyChildren: [innerMethod],
      });
      const outerClass = mockClassDecl({
        name: 'Outer', startRow: 0, endRow: 4, text: source,
        bodyChildren: [innerClass],
      });
      const root = mockProgram([outerClass], source);

      const result = extractNodes(root);

      // Outer CLASS чанк эмитируется (top-level).
      const outerChunk = result.find(n => n.fragmentType === 'CLASS');
      expect(outerChunk!.fqn).toBe('Outer');

      // Inner CLASS чанк НЕ эмитируется (nested).
      const innerChunk = result.find(n => n.fqn === 'Outer.Inner');
      expect(innerChunk).toBeUndefined();

      // Метод вложенного класса → FQN с полным путём.
      const methodChunk = result.find(n => n.fragmentType === 'METHOD');
      expect(methodChunk).toBeDefined();
      expect(methodChunk!.fqn).toBe('Outer.Inner.innerMethod');
    });

    it('nested class methods с package → FQN com.example.Outer.Inner.innerMethod', () => {
      const source = [
        'package com.example;',
        'public class Outer {',
        '  class Inner {',
        '    void innerMethod() {}',
        '  }',
        '}',
      ].join('\n');

      const scopedId = mockNode({ type: 'scoped_identifier', text: 'com.example' });
      const packageDecl = mockNode({
        type: 'package_declaration',
        text: 'package com.example;',
        children: [scopedId],
      });

      const innerMethod = mockMethodDecl({
        name: 'innerMethod', startRow: 3, endRow: 3, text: '    void innerMethod() {}',
      });
      const innerClass = mockClassDecl({
        name: 'Inner', startRow: 2, endRow: 4, text: source.split('\n').slice(2, 5).join('\n'),
        bodyChildren: [innerMethod],
      });
      const outerClass = mockClassDecl({
        name: 'Outer', startRow: 1, endRow: 5, text: source.split('\n').slice(1).join('\n'),
        bodyChildren: [innerClass],
      });
      const root = mockProgram([packageDecl, outerClass], source);

      const result = extractNodes(root);

      const methodChunk = result.find(n => n.fragmentType === 'METHOD');
      expect(methodChunk!.fqn).toBe('com.example.Outer.Inner.innerMethod');
    });

    it('метод без класса (top-level) → не эмитируется', () => {
      // В Java такого не бывает, но проверяем защиту.
      const source = 'void orphan() {}';
      const method = mockMethodDecl({ name: 'orphan', startRow: 0, endRow: 0, text: source });
      const root = mockProgram([method], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(0);
    });

    it('startLine/endLine корректны (1-based)', () => {
      const source = [
        'public class MyService {',   // row 0 → line 1
        '  public void doWork() {}', // row 1 → line 2
        '}',                          // row 2 → line 3
      ].join('\n');

      const method = mockMethodDecl({ name: 'doWork', startRow: 1, endRow: 1, text: '  public void doWork() {}' });
      const cls = mockClassDecl({
        name: 'MyService', startRow: 0, endRow: 2, text: source,
        bodyChildren: [method],
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);

      const classChunk = result.find(n => n.fragmentType === 'CLASS');
      expect(classChunk!.startLine).toBe(1);
      expect(classChunk!.endLine).toBe(3);

      const methodChunk = result.find(n => n.fragmentType === 'METHOD');
      expect(methodChunk!.startLine).toBe(2);
      expect(methodChunk!.endLine).toBe(2);
    });
  });
});
