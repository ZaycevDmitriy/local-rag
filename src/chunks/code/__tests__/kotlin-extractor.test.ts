import { describe, it, expect } from 'vitest';
import { extractNodes } from '../kotlin-extractor.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockNode = any;

// Фабрика базовой мок-ноды.
function mockNode(overrides: Partial<{
  type: string;
  text: string;
  children: MockNode[];
  startPosition: { row: number };
  endPosition: { row: number };
  parent: MockNode;
}>): MockNode {
  return {
    type: 'unknown',
    text: '',
    children: [],
    startPosition: { row: 0 },
    endPosition: { row: 0 },
    parent: null,
    ...overrides,
  };
}

// Создаёт mock identifier-ноду заданного типа.
function mockIdent(text: string, type = 'type_identifier', row = 0): MockNode {
  return mockNode({ type, text, startPosition: { row }, endPosition: { row } });
}

// Создаёт mock корневого узла source_file с заданными children и source text.
// Устанавливает parent для всех дочерних нод.
function mockProgram(children: MockNode[], sourceText: string): MockNode {
  const program = mockNode({
    type: 'source_file',
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

// Создаёт mock class_body с заданными children.
// Устанавливает parent для всех дочерних нод после привязки к классу.
function mockClassBody(children: MockNode[]): MockNode {
  return mockNode({ type: 'class_body', children });
}

// Создаёт mock modifiers с вложенными class_modifier нодами.
function mockModifiers(modifiers: Array<{ type: string; text: string }>): MockNode {
  const classModifiers = modifiers.map(m =>
    mockNode({
      type: 'class_modifier',
      text: m.text,
      children: [mockNode({ type: m.type, text: m.text })],
    }),
  );
  return mockNode({ type: 'modifiers', children: classModifiers });
}

// Создаёт mock class_declaration.
function mockClassDecl(params: {
  name: string;
  bodyChildren?: MockNode[];
  startRow?: number;
  endRow?: number;
  text?: string;
  modifierTypes?: Array<{ type: string; text: string }>;
  hasEnum?: boolean;
  hasInterface?: boolean;
}): MockNode {
  const {
    name,
    bodyChildren = [],
    startRow = 0,
    endRow = 0,
    text = '',
    modifierTypes,
    hasEnum = false,
    hasInterface = false,
  } = params;

  const nameNode = mockIdent(name, 'type_identifier', startRow);
  const body = mockClassBody(bodyChildren);
  body.startPosition = { row: startRow };
  body.endPosition = { row: endRow };

  const children: MockNode[] = [];
  if (modifierTypes) {
    children.push(mockModifiers(modifierTypes));
  }
  if (hasEnum) {
    children.push(mockNode({ type: 'enum', text: 'enum' }));
  }
  if (hasInterface) {
    children.push(mockNode({ type: 'interface', text: 'interface' }));
  }
  children.push(mockNode({ type: 'class', text: 'class' }));
  children.push(nameNode);
  children.push(body);

  const cls = mockNode({
    type: 'class_declaration',
    text,
    startPosition: { row: startRow },
    endPosition: { row: endRow },
    children,
  });

  body.parent = cls;
  for (const child of bodyChildren) {
    child.parent = body;
  }
  for (const child of children) {
    if (child !== body) child.parent = cls;
  }

  return cls;
}

// Создаёт mock object_declaration.
function mockObjectDecl(params: {
  name: string;
  bodyChildren?: MockNode[];
  startRow?: number;
  endRow?: number;
  text?: string;
}): MockNode {
  const { name, bodyChildren = [], startRow = 0, endRow = 0, text = '' } = params;

  const nameNode = mockIdent(name, 'type_identifier', startRow);
  const body = mockClassBody(bodyChildren);
  body.startPosition = { row: startRow };
  body.endPosition = { row: endRow };

  const children: MockNode[] = [
    mockNode({ type: 'object', text: 'object' }),
    nameNode,
    body,
  ];

  const obj = mockNode({
    type: 'object_declaration',
    text,
    startPosition: { row: startRow },
    endPosition: { row: endRow },
    children,
  });

  body.parent = obj;
  for (const child of bodyChildren) {
    child.parent = body;
  }
  for (const child of children) {
    if (child !== body) child.parent = obj;
  }

  return obj;
}

// Создаёт mock companion_object (имя опционально).
function mockCompanionObject(params: {
  name?: string;
  bodyChildren?: MockNode[];
  startRow?: number;
  endRow?: number;
  text?: string;
}): MockNode {
  const { name, bodyChildren = [], startRow = 0, endRow = 0, text = '' } = params;

  const body = mockClassBody(bodyChildren);
  body.startPosition = { row: startRow };
  body.endPosition = { row: endRow };

  const children: MockNode[] = [
    mockNode({ type: 'companion', text: 'companion' }),
    mockNode({ type: 'object', text: 'object' }),
  ];
  if (name) {
    children.push(mockIdent(name, 'type_identifier', startRow));
  }
  children.push(body);

  const companion = mockNode({
    type: 'companion_object',
    text,
    startPosition: { row: startRow },
    endPosition: { row: endRow },
    children,
  });

  body.parent = companion;
  for (const child of bodyChildren) {
    child.parent = body;
  }
  for (const child of children) {
    if (child !== body) child.parent = companion;
  }

  return companion;
}

// Создаёт mock function_declaration.
// receiverType: если задан, добавляет user_type + '.' перед simple_identifier (extension function).
function mockFunctionDecl(params: {
  name: string;
  startRow?: number;
  endRow?: number;
  text?: string;
  receiverType?: string;
}): MockNode {
  const { name, startRow = 0, endRow = 0, text = '', receiverType } = params;

  const children: MockNode[] = [];
  if (receiverType) {
    children.push(mockNode({ type: 'user_type', text: receiverType }));
    children.push(mockNode({ type: '.', text: '.' }));
  }
  children.push(mockIdent(name, 'simple_identifier', startRow));

  return mockNode({
    type: 'function_declaration',
    text,
    startPosition: { row: startRow },
    endPosition: { row: endRow },
    children,
  });
}

// Создаёт mock property_declaration.
function mockPropertyDecl(params: {
  name: string;
  startRow?: number;
  endRow?: number;
  text?: string;
}): MockNode {
  const { name, startRow = 0, endRow = 0, text = '' } = params;
  return mockNode({
    type: 'property_declaration',
    text,
    startPosition: { row: startRow },
    endPosition: { row: endRow },
    children: [mockIdent(name, 'simple_identifier', startRow)],
  });
}

// Создаёт mock package_header с identifier дочерним узлом.
function mockPackageHeader(packageName: string): MockNode {
  const identifier = mockNode({ type: 'identifier', text: packageName });
  return mockNode({
    type: 'package_header',
    text: `package ${packageName}`,
    children: [
      mockNode({ type: 'package', text: 'package' }),
      identifier,
    ],
  });
}

describe('kotlin-extractor', () => {
  describe('extractNodes', () => {
    it('пустой файл возвращает []', () => {
      const root = mockProgram([], '');
      expect(extractNodes(root)).toEqual([]);
    });

    it('обычный класс с методом → CLASS + METHOD чанки, корректный FQN', () => {
      const source = [
        'class MyService {',
        '    fun doWork() {}',
        '}',
      ].join('\n');

      const method = mockFunctionDecl({ name: 'doWork', startRow: 1, endRow: 1, text: '    fun doWork() {}' });
      const cls = mockClassDecl({
        name: 'MyService',
        startRow: 0,
        endRow: 2,
        text: source,
        bodyChildren: [method],
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(2);

      const classChunk = result.find(n => n.fragmentType === 'CLASS');
      expect(classChunk).toBeDefined();
      expect(classChunk!.fqn).toBe('MyService');
      expect(classChunk!.startLine).toBe(1);
      expect(classChunk!.endLine).toBe(3);

      const methodChunk = result.find(n => n.fragmentType === 'METHOD');
      expect(methodChunk).toBeDefined();
      expect(methodChunk!.fqn).toBe('MyService.doWork');
    });

    it('data class → CLASS (fragmentSubtype: DATA_CLASS)', () => {
      const source = 'data class Point(val x: Int, val y: Int)';

      const cls = mockClassDecl({
        name: 'Point',
        startRow: 0,
        endRow: 0,
        text: source,
        modifierTypes: [{ type: 'data', text: 'data' }],
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('CLASS');
      expect(result[0]!.fragmentSubtype).toBe('DATA_CLASS');
      expect(result[0]!.fqn).toBe('Point');
    });

    it('sealed class → CLASS (fragmentSubtype: SEALED_CLASS)', () => {
      const source = 'sealed class Result';

      const cls = mockClassDecl({
        name: 'Result',
        startRow: 0,
        endRow: 0,
        text: source,
        modifierTypes: [{ type: 'sealed', text: 'sealed' }],
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('CLASS');
      expect(result[0]!.fragmentSubtype).toBe('SEALED_CLASS');
      expect(result[0]!.fqn).toBe('Result');
    });

    it('object declaration → CLASS (fragmentSubtype: OBJECT)', () => {
      const source = 'object Singleton {}';

      const obj = mockObjectDecl({
        name: 'Singleton',
        startRow: 0,
        endRow: 0,
        text: source,
      });
      const root = mockProgram([obj], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('CLASS');
      expect(result[0]!.fragmentSubtype).toBe('OBJECT');
      expect(result[0]!.fqn).toBe('Singleton');
    });

    it('безымянный companion object → CLASS (fragmentSubtype: COMPANION_OBJECT) + METHOD с FQN через Companion', () => {
      const source = [
        'class MyClass {',
        '    companion object {',
        '        fun create(): MyClass = MyClass()',
        '    }',
        '}',
      ].join('\n');

      const factoryFun = mockFunctionDecl({
        name: 'create',
        startRow: 2,
        endRow: 2,
        text: '        fun create(): MyClass = MyClass()',
      });
      const companion = mockCompanionObject({
        bodyChildren: [factoryFun],
        startRow: 1,
        endRow: 3,
        text: '    companion object {\n        fun create(): MyClass = MyClass()\n    }',
      });
      const cls = mockClassDecl({
        name: 'MyClass',
        startRow: 0,
        endRow: 4,
        text: source,
        bodyChildren: [companion],
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);

      // CLASS чанк для MyClass.
      const classChunk = result.find(n => n.fqn === 'MyClass');
      expect(classChunk).toBeDefined();
      expect(classChunk!.fragmentType).toBe('CLASS');

      // Companion object эмитирует CLASS (COMPANION_OBJECT).
      const companionChunk = result.find(n => n.fragmentSubtype === 'COMPANION_OBJECT');
      expect(companionChunk).toBeDefined();
      expect(companionChunk!.fragmentType).toBe('CLASS');
      expect(companionChunk!.fqn).toBe('MyClass.Companion');

      // Метод companion → METHOD с FQN через Companion.
      const methodChunk = result.find(n => n.fragmentType === 'METHOD');
      expect(methodChunk).toBeDefined();
      expect(methodChunk!.fqn).toBe('MyClass.Companion.create');
    });

    it('extension function → FUNCTION (fragmentSubtype: EXTENSION_FUNCTION, receiverType задан)', () => {
      const source = 'fun String.greet(): String = "Hello, $this"';

      const fn = mockFunctionDecl({
        name: 'greet',
        startRow: 0,
        endRow: 0,
        text: source,
        receiverType: 'String',
      });
      const root = mockProgram([fn], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('FUNCTION');
      expect(result[0]!.fragmentSubtype).toBe('EXTENSION_FUNCTION');
      expect(result[0]!.receiverType).toBe('String');
      expect(result[0]!.fqn).toBe('greet');
    });

    it('top-level функция → FUNCTION без subtype', () => {
      const source = 'fun main() { println("Hello") }';

      const fn = mockFunctionDecl({ name: 'main', startRow: 0, endRow: 0, text: source });
      const root = mockProgram([fn], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('FUNCTION');
      expect(result[0]!.fragmentSubtype).toBeUndefined();
      expect(result[0]!.fqn).toBe('main');
    });

    it('top-level properties → сгруппированы, fragmentSubtype: PROPERTIES, fragmentType: FUNCTION', () => {
      const source = [
        'val HOST = "localhost"',
        'val PORT = 8080',
        'val TIMEOUT = 30',
      ].join('\n');

      const prop1 = mockPropertyDecl({ name: 'HOST', startRow: 0, endRow: 0, text: 'val HOST = "localhost"' });
      const prop2 = mockPropertyDecl({ name: 'PORT', startRow: 1, endRow: 1, text: 'val PORT = 8080' });
      const prop3 = mockPropertyDecl({ name: 'TIMEOUT', startRow: 2, endRow: 2, text: 'val TIMEOUT = 30' });
      const root = mockProgram([prop1, prop2, prop3], source);

      const result = extractNodes(root);

      // Все три properties группируются в один чанк.
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('FUNCTION');
      expect(result[0]!.fragmentSubtype).toBe('PROPERTIES');
      expect(result[0]!.startLine).toBe(1);
      expect(result[0]!.endLine).toBe(3);
    });

    it('enum class → ENUM', () => {
      const source = 'enum class Status { ACTIVE, INACTIVE }';

      const cls = mockClassDecl({
        name: 'Status',
        startRow: 0,
        endRow: 0,
        text: source,
        hasEnum: true,
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('ENUM');
      expect(result[0]!.fqn).toBe('Status');
    });

    it('interface → INTERFACE', () => {
      const source = 'interface MyInterface { fun doWork() }';

      const cls = mockClassDecl({
        name: 'MyInterface',
        startRow: 0,
        endRow: 0,
        text: source,
        hasInterface: true,
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      expect(result[0]!.fragmentType).toBe('INTERFACE');
      expect(result[0]!.fqn).toBe('MyInterface');
    });

    it('package → FQN включает package prefix', () => {
      const source = [
        'package com.example',
        'class MyService {',
        '    fun doWork() {}',
        '}',
      ].join('\n');

      const pkg = mockPackageHeader('com.example');
      const method = mockFunctionDecl({ name: 'doWork', startRow: 2, endRow: 2, text: '    fun doWork() {}' });
      const cls = mockClassDecl({
        name: 'MyService',
        startRow: 1,
        endRow: 3,
        text: source.split('\n').slice(1).join('\n'),
        bodyChildren: [method],
      });
      const root = mockProgram([pkg, cls], source);

      const result = extractNodes(root);

      const classChunk = result.find(n => n.fragmentType === 'CLASS');
      expect(classChunk!.fqn).toBe('com.example.MyService');

      const methodChunk = result.find(n => n.fragmentType === 'METHOD');
      expect(methodChunk!.fqn).toBe('com.example.MyService.doWork');
    });

    it('без package → FQN без prefix', () => {
      const source = 'class Standalone {}';

      const cls = mockClassDecl({ name: 'Standalone', startRow: 0, endRow: 0, text: source });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result[0]!.fqn).toBe('Standalone');
    });

    it('аннотация внутри modifiers — node начинается на строке аннотации, текст содержит аннотацию', () => {
      // Kotlin: аннотации внутри modifiers (часть node.text), не siblings.
      // startLine = startPosition.row класса (где начинается node с аннотацией).
      const source = [
        '@Serializable',
        'data class Config(val host: String)',
      ].join('\n');

      // Симулируем, что класс начинается со строки аннотации (row 0),
      // так как в реальном Kotlin AST modifiers — часть class_declaration.
      const cls = mockClassDecl({
        name: 'Config',
        startRow: 0,
        endRow: 1,
        text: source,
        modifierTypes: [{ type: 'data', text: 'data' }],
      });
      const root = mockProgram([cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      // startLine = строка, с которой начинается узел (включает аннотацию через text).
      expect(result[0]!.startLine).toBe(1);
      expect(result[0]!.endLine).toBe(2);
      // Текст содержит аннотацию (она часть node.text).
      expect(result[0]!.text).toContain('@Serializable');
      expect(result[0]!.text).toContain('data class Config');
    });

    it('KDoc (multiline_comment sibling) → startLine расширен до строки KDoc', () => {
      const source = [
        '/** Описание класса. */',
        'class MyService {}',
      ].join('\n');

      const kdoc = mockNode({
        type: 'multiline_comment',
        text: '/** Описание класса. */',
        startPosition: { row: 0 },
        endPosition: { row: 0 },
      });
      const cls = mockClassDecl({
        name: 'MyService',
        startRow: 1,
        endRow: 1,
        text: 'class MyService {}',
      });
      const root = mockProgram([kdoc, cls], source);

      const result = extractNodes(root);
      expect(result).toHaveLength(1);
      // captureLeadingAnnotations находит multiline_comment sibling → startLine = 1.
      expect(result[0]!.startLine).toBe(1);
      expect(result[0]!.endLine).toBe(2);
      // Текст включает KDoc.
      expect(result[0]!.text).toContain('/** Описание класса. */');
      expect(result[0]!.text).toContain('class MyService');
    });

    it('методы вложенного класса → FQN с полным путём (Outer.Inner.method)', () => {
      const source = [
        'class Outer {',
        '    class Inner {',
        '        fun innerMethod() {}',
        '    }',
        '}',
      ].join('\n');

      const innerMethod = mockFunctionDecl({
        name: 'innerMethod',
        startRow: 2,
        endRow: 2,
        text: '        fun innerMethod() {}',
      });
      const innerCls = mockClassDecl({
        name: 'Inner',
        startRow: 1,
        endRow: 3,
        text: source.split('\n').slice(1, 4).join('\n'),
        bodyChildren: [innerMethod],
      });
      const outerCls = mockClassDecl({
        name: 'Outer',
        startRow: 0,
        endRow: 4,
        text: source,
        bodyChildren: [innerCls],
      });
      const root = mockProgram([outerCls], source);

      const result = extractNodes(root);

      // Outer → CLASS чанк эмитируется (top-level).
      const outerChunk = result.find(n => n.fqn === 'Outer');
      expect(outerChunk).toBeDefined();
      expect(outerChunk!.fragmentType).toBe('CLASS');

      // Inner → CLASS чанк НЕ эмитируется (nested, classStack.length > 0).
      const innerChunk = result.find(n => n.fqn === 'Outer.Inner');
      expect(innerChunk).toBeUndefined();

      // Метод вложенного класса → FQN с полным путём.
      const methodChunk = result.find(n => n.fragmentType === 'METHOD');
      expect(methodChunk).toBeDefined();
      expect(methodChunk!.fqn).toBe('Outer.Inner.innerMethod');
    });
  });
});
