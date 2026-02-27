import { describe, it, expect } from 'vitest';
import { TreeSitterChunker } from '../tree-sitter-chunker.js';
import { isTreeSitterSupported, _resetLanguageCache } from '../languages.js';
import type { FileContent } from '../../types.js';

// Сбрасываем кэш языков перед проверкой доступности.
_resetLanguageCache();
const kotlinAvailable = isTreeSitterSupported('Test.kt');

function makeFile(content: string, path = 'MyFile.kt'): FileContent {
  return { path, content, sourceId: 'source-kotlin' };
}

describe.skipIf(!kotlinAvailable)('Kotlin tree-sitter integration', () => {
  const config = { maxTokens: 500, overlap: 50 };

  it('supports() для .kt и .kts файлов → true', () => {
    const chunker = new TreeSitterChunker(config);
    expect(chunker.supports('Main.kt')).toBe(true);
    expect(chunker.supports('build.kts')).toBe(true);
  });

  it('не поддерживает .py → false', () => {
    const chunker = new TreeSitterChunker(config);
    expect(chunker.supports('script.py')).toBe(false);
  });

  it('пустой файл → []', () => {
    const chunker = new TreeSitterChunker(config);
    expect(chunker.chunk(makeFile(''))).toEqual([]);
  });

  it('обычный класс с методом → CLASS + METHOD, FQN включает package', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example',
      '',
      'class MyService {',
      '    fun doWork() {',
      '        println("work")',
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

  it('data class → CLASS subtype DATA_CLASS', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example',
      '',
      'data class Point(val x: Int, val y: Int)',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Point.kt'));

    const classChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
    expect(classChunk).toBeDefined();
    expect(classChunk!.metadata.fqn).toBe('com.example.Point');
    expect(classChunk!.metadata.fragmentSubtype).toBe('DATA_CLASS');
  });

  it('sealed class → CLASS subtype SEALED_CLASS', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example',
      '',
      'sealed class Result {',
      '    class Success(val value: String) : Result()',
      '    class Failure(val error: Throwable) : Result()',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Result.kt'));

    const classChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
    expect(classChunk).toBeDefined();
    expect(classChunk!.metadata.fqn).toBe('com.example.Result');
    expect(classChunk!.metadata.fragmentSubtype).toBe('SEALED_CLASS');
  });

  it('object declaration → CLASS subtype OBJECT', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example',
      '',
      'object Singleton {',
      '    fun getInstance() = this',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Singleton.kt'));

    const objectChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
    expect(objectChunk).toBeDefined();
    expect(objectChunk!.metadata.fqn).toBe('com.example.Singleton');
    expect(objectChunk!.metadata.fragmentSubtype).toBe('OBJECT');
  });

  it('companion object → CLASS subtype COMPANION_OBJECT + METHOD с FQN через Companion', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example',
      '',
      'class MyFactory {',
      '    companion object {',
      '        fun create() = MyFactory()',
      '    }',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'MyFactory.kt'));

    // CLASS чанк для внешнего класса.
    const outerClass = result.find(
      c => c.metadata.fragmentType === 'CLASS' && c.metadata.fqn === 'com.example.MyFactory',
    );
    expect(outerClass).toBeDefined();

    // CLASS чанк для companion object (FQN включает внешний класс в стек).
    const companionChunk = result.find(
      c => c.metadata.fragmentType === 'CLASS' && c.metadata.fragmentSubtype === 'COMPANION_OBJECT',
    );
    expect(companionChunk).toBeDefined();
    expect(companionChunk!.metadata.fqn).toBe('com.example.MyFactory.Companion');

    // METHOD чанк для метода companion object.
    const methodChunk = result.find(c => c.metadata.fragmentType === 'METHOD');
    expect(methodChunk).toBeDefined();
    expect(methodChunk!.metadata.fqn).toBe('com.example.MyFactory.Companion.create');
  });

  it('extension function → FUNCTION subtype EXTENSION_FUNCTION, receiverType установлен', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example',
      '',
      'fun String.toUpperSlug(): String = this.uppercase()',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Extensions.kt'));

    const extFn = result.find(c => c.metadata.fragmentType === 'FUNCTION');
    expect(extFn).toBeDefined();
    expect(extFn!.metadata.fragmentSubtype).toBe('EXTENSION_FUNCTION');
    expect(extFn!.metadata.receiverType).toBe('String');
    expect(extFn!.metadata.fqn).toBe('com.example.toUpperSlug');
  });

  it('top-level function → FUNCTION без subtype', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example',
      '',
      'fun greet(name: String): String {',
      '    return "Hello, $name!"',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Greet.kt'));

    const fn = result.find(c => c.metadata.fragmentType === 'FUNCTION');
    expect(fn).toBeDefined();
    expect(fn!.metadata.fragmentSubtype).toBeUndefined();
    expect(fn!.metadata.fqn).toBe('com.example.greet');
  });

  it('top-level properties → FUNCTION subtype PROPERTIES', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'val baseUrl = "http://localhost"',
      'var timeout = 30',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Constants.kt'));

    const propsChunk = result.find(c => c.metadata.fragmentSubtype === 'PROPERTIES');
    expect(propsChunk).toBeDefined();
    expect(propsChunk!.metadata.fragmentType).toBe('FUNCTION');
  });

  it('enum class → ENUM', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example',
      '',
      'enum class Status {',
      '    ACTIVE,',
      '    INACTIVE',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Status.kt'));

    const enumChunk = result.find(c => c.metadata.fragmentType === 'ENUM');
    expect(enumChunk).toBeDefined();
    expect(enumChunk!.metadata.fqn).toBe('com.example.Status');
  });

  it('interface → INTERFACE', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example',
      '',
      'interface MyInterface {',
      '    fun process()',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'MyInterface.kt'));

    const ifaceChunk = result.find(c => c.metadata.fragmentType === 'INTERFACE');
    expect(ifaceChunk).toBeDefined();
    expect(ifaceChunk!.metadata.fqn).toBe('com.example.MyInterface');
  });

  it('KDoc включён в текст чанка класса (startLine расширен, текст содержит /**, startLine = 1)', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      '/**',
      ' * Сервис обработки.',
      ' */',
      'class DataService {',
      '    fun run() {}',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'DataService.kt'));

    const classChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
    expect(classChunk).toBeDefined();
    // startLine расширен до KDoc.
    expect(classChunk!.metadata.startLine).toBe(1);
    // Текст содержит KDoc.
    expect(classChunk!.content).toContain('/**');
    expect(classChunk!.content).toContain('class DataService');
  });

  it('metadata.language === kotlin для всех чанков', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example',
      '',
      'class Foo {',
      '    fun bar() {}',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Foo.kt'));

    expect(result.length).toBeGreaterThan(0);
    for (const chunk of result) {
      expect(chunk.metadata.language).toBe('kotlin');
      expect(chunk.metadata.sourceType).toBe('code');
    }
  });

  it('вложенный класс: методы с FQN Outer.Inner.method, Inner CLASS не эмитируется', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'class Outer {',
      '    class Inner {',
      '        fun innerMethod() {}',
      '    }',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Outer.kt'));

    // Метод вложенного класса имеет FQN Outer.Inner.innerMethod.
    const methodChunk = result.find(c => c.metadata.fragmentType === 'METHOD');
    expect(methodChunk).toBeDefined();
    expect(methodChunk!.metadata.fqn).toBe('Outer.Inner.innerMethod');

    // Вложенный класс не эмитирует отдельный CLASS чанк.
    const classChunks = result.filter(c => c.metadata.fragmentType === 'CLASS');
    expect(classChunks).toHaveLength(1);
    expect(classChunks[0]!.metadata.fqn).toBe('Outer');
  });

  it('несколько методов → несколько METHOD чанков', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'class Calculator {',
      '    fun add(a: Int, b: Int) = a + b',
      '    fun sub(a: Int, b: Int) = a - b',
      '    fun mul(a: Int, b: Int) = a * b',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'Calculator.kt'));

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

    const lines = ['class BigClass {'];
    for (let i = 0; i < 30; i++) {
      lines.push(`    val field${i}: Int = ${i}`);
    }
    lines.push('}');
    const content = lines.join('\n');
    const result = chunker.chunk(makeFile(content, 'BigClass.kt'));

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.metadata.fqn).toBe('BigClass');
      expect(chunk.metadata.language).toBe('kotlin');
    }
  });

  it('уникальные id чанков', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'class MyService {',
      '    fun a() {}',
      '    fun b() {}',
      '    fun c() {}',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'MyService.kt'));

    const ids = result.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
