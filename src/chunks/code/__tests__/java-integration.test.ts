import { describe, it, expect } from 'vitest';
import { TreeSitterChunker } from '../tree-sitter-chunker.js';
import { isTreeSitterSupported, _resetLanguageCache } from '../languages.js';
import type { FileContent } from '../../types.js';

// Сбрасываем кэш языков перед проверкой доступности.
_resetLanguageCache();
const javaAvailable = isTreeSitterSupported('Test.java');

function makeFile(content: string, path = 'MyService.java'): FileContent {
  return { path, content, sourceId: 'source-java' };
}

describe.skipIf(!javaAvailable)('Java tree-sitter integration', () => {
  const config = { maxTokens: 500, overlap: 50 };

  it('supports() для .java', () => {
    const chunker = new TreeSitterChunker(config);
    expect(chunker.supports('Test.java')).toBe(true);
    expect(chunker.supports('Main.java')).toBe(true);
  });

  it('не поддерживает .py', () => {
    const chunker = new TreeSitterChunker(config);
    expect(chunker.supports('script.py')).toBe(false);
  });

  it('пустой файл → []', () => {
    const chunker = new TreeSitterChunker(config);
    expect(chunker.chunk(makeFile(''))).toEqual([]);
  });

  it('класс с методом → CLASS + METHOD', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example;',
      '',
      'public class MyService {',
      '    public void doWork() {',
      '        System.out.println("work");',
      '    }',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content));

    const classChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
    expect(classChunk).toBeDefined();
    expect(classChunk!.metadata.fqn).toBe('com.example.MyService');

    const methodChunk = result.find(c => c.metadata.fragmentType === 'METHOD');
    expect(methodChunk).toBeDefined();
    expect(methodChunk!.metadata.fqn).toBe('com.example.MyService.doWork');
  });

  it('record → CLASS subtype RECORD', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example;',
      '',
      'public record Point(int x, int y) {}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Point.java'));

    const recordChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
    expect(recordChunk).toBeDefined();
    expect(recordChunk!.metadata.fqn).toBe('com.example.Point');
    expect(recordChunk!.metadata.fragmentSubtype).toBe('RECORD');
  });

  it('enum → ENUM', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example;',
      '',
      'public enum Status {',
      '    ACTIVE,',
      '    INACTIVE',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Status.java'));

    const enumChunk = result.find(c => c.metadata.fragmentType === 'ENUM');
    expect(enumChunk).toBeDefined();
    expect(enumChunk!.metadata.fqn).toBe('com.example.Status');
  });

  it('interface → INTERFACE', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example;',
      '',
      'public interface MyInterface {',
      '    void process();',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'MyInterface.java'));

    const ifaceChunk = result.find(c => c.metadata.fragmentType === 'INTERFACE');
    expect(ifaceChunk).toBeDefined();
    expect(ifaceChunk!.metadata.fqn).toBe('com.example.MyInterface');
  });

  it('annotation type → INTERFACE subtype ANNOTATION_TYPE', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example;',
      '',
      'public @interface MyAnnotation {',
      '    String value();',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'MyAnnotation.java'));

    const annoChunk = result.find(c => c.metadata.fragmentType === 'INTERFACE');
    expect(annoChunk).toBeDefined();
    expect(annoChunk!.metadata.fragmentSubtype).toBe('ANNOTATION_TYPE');
  });

  it('конструктор → METHOD subtype CONSTRUCTOR', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'public class MyService {',
      '    public MyService(String name) {',
      '        this.name = name;',
      '    }',
      '    private String name;',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content));

    const ctorChunk = result.find(c => c.metadata.fragmentSubtype === 'CONSTRUCTOR');
    expect(ctorChunk).toBeDefined();
    expect(ctorChunk!.metadata.fragmentType).toBe('METHOD');
    expect(ctorChunk!.metadata.fqn).toBe('MyService.MyService');
  });

  it('Javadoc включён в текст чанка класса', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      '/** Сервис для обработки данных. */',
      'public class DataService {',
      '    public void run() {}',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'DataService.java'));

    const classChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
    expect(classChunk).toBeDefined();
    // startLine расширен до Javadoc.
    expect(classChunk!.metadata.startLine).toBe(1);
    // Текст содержит Javadoc.
    expect(classChunk!.content).toContain('/** Сервис');
    expect(classChunk!.content).toContain('public class DataService');
  });

  it('аннотация включена в текст чанка (часть класса)', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      '@Deprecated',
      'public class OldService {',
      '    public void work() {}',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'OldService.java'));

    const classChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
    expect(classChunk).toBeDefined();
    // Аннотации входят в node.text (часть modifiers).
    expect(classChunk!.content).toContain('@Deprecated');
  });

  it('metadata: language === java', () => {
    const chunker = new TreeSitterChunker(config);
    const content = 'public class Foo {}';
    const result = chunker.chunk(makeFile(content, 'Foo.java'));

    expect(result.length).toBeGreaterThan(0);
    for (const chunk of result) {
      expect(chunk.metadata.language).toBe('java');
      expect(chunk.metadata.sourceType).toBe('code');
    }
  });

  it('корректные startLine/endLine', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'public class MyService {',  // line 1
      '    public void doWork() {',  // line 2
      '        return;',             // line 3
      '    }',                       // line 4
      '}',                           // line 5
    ].join('\n');
    const result = chunker.chunk(makeFile(content));

    const classChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
    expect(classChunk!.metadata.startLine).toBe(1);
    expect(classChunk!.metadata.endLine).toBe(5);

    const methodChunk = result.find(c => c.metadata.fragmentType === 'METHOD');
    expect(methodChunk!.metadata.startLine).toBe(2);
    expect(methodChunk!.metadata.endLine).toBe(4);
  });

  it('несколько методов → несколько METHOD чанков', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'public class Calculator {',
      '    public int add(int a, int b) { return a + b; }',
      '    public int sub(int a, int b) { return a - b; }',
      '    public int mul(int a, int b) { return a * b; }',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Calculator.java'));

    const methodFqns = result
      .filter(c => c.metadata.fragmentType === 'METHOD')
      .map(c => c.metadata.fqn);

    expect(methodFqns).toContain('Calculator.add');
    expect(methodFqns).toContain('Calculator.sub');
    expect(methodFqns).toContain('Calculator.mul');
  });

  it('oversized класс → несколько чанков', () => {
    // Маленький лимит: 20 токенов = 80 символов.
    const smallConfig = { maxTokens: 20, overlap: 2 };
    const chunker = new TreeSitterChunker(smallConfig);

    const lines = ['public class BigClass {'];
    for (let i = 0; i < 30; i++) {
      lines.push(`    private int field${i} = ${i};`);
    }
    lines.push('}');
    const content = lines.join('\n');
    const result = chunker.chunk(makeFile(content, 'BigClass.java'));

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.metadata.fqn).toBe('BigClass');
      expect(chunk.metadata.language).toBe('java');
    }
  });

  it('вложенный класс: методы с FQN Outer.Inner.method', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'public class Outer {',
      '    class Inner {',
      '        void innerMethod() {}',
      '    }',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Outer.java'));

    const methodChunk = result.find(c => c.metadata.fragmentType === 'METHOD');
    expect(methodChunk).toBeDefined();
    expect(methodChunk!.metadata.fqn).toBe('Outer.Inner.innerMethod');

    // Вложенный класс не эмитирует отдельный CLASS чанк.
    const classChunks = result.filter(c => c.metadata.fragmentType === 'CLASS');
    expect(classChunks).toHaveLength(1);
    expect(classChunks[0]!.metadata.fqn).toBe('Outer');
  });

  it('уникальные id чанков', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'public class MyService {',
      '    public void a() {}',
      '    public void b() {}',
      '    public void c() {}',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content));

    const ids = result.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
