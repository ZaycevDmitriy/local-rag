# Фаза 6: Java tree-sitter

Цель: полноценный tree-sitter AST-парсинг Java-файлов с извлечением классов, интерфейсов, методов, enum-ов, records, annotation types. FQN с package. Аннотации и Javadoc включены в чанки.

**Предусловие:** фаза 5 завершена (рефакторинг, extractor-types.ts, dynamic supports, parser cache).

**Критерий завершения:** Java-файлы парсятся tree-sitter с корректным извлечением AST-узлов. Graceful degradation на FallbackChunker если tree-sitter-java не установлен. Все тесты проходят.

---

## Шаг 6.1 — npm-зависимость tree-sitter-java

### Задача

Добавить `tree-sitter-java` в `optionalDependencies`. Подобрать версию, совместимую с `tree-sitter@0.21.1`.

### Действия

```bash
npm install --save-optional tree-sitter-java
```

### Проверка совместимости

1. `npm install` — компиляция нативного модуля без ошибок.
2. Простой smoke-тест в Node.js REPL:

```javascript
const Parser = require('tree-sitter');
const Java = require('tree-sitter-java');
const parser = new Parser();
parser.setLanguage(Java);
const tree = parser.parse('class Foo { void bar() {} }');
console.log(tree.rootNode.type); // 'program'
```

3. Если версия не совместима — попробовать другую версию tree-sitter-java или зафиксировать конкретную.

### Файлы

| Файл | Действие |
|------|----------|
| `package.json` | Добавить `optionalDependencies.tree-sitter-java` |

---

## Шаг 6.2 — Исследование Java AST node types

### Задача

Перед реализацией экстрактора — исследовать реальное AST-дерево tree-sitter-java. Документировать точные node types, имена полей (field names), структуру вложенности.

### Метод

Написать одноразовый скрипт (или использовать REPL) для парсинга Java-сниппетов и вывода AST:

```javascript
// Парсим пример и выводим дерево.
const code = `
package com.example;

import java.util.List;

/**
 * Javadoc для класса.
 */
@Deprecated
public class MyService {
    private final String name;

    @Override
    public void doWork() {
        System.out.println("work");
    }

    public record Point(int x, int y) {}

    public @interface MyAnnotation {
        String value();
    }

    public enum Status { ACTIVE, INACTIVE }

    class Inner {
        void innerMethod() {}
    }
}
`;
```

### Документировать

| Конструкция | node.type | Имя из поля | Тело из поля |
|---|---|---|---|
| package | `package_declaration` | — | `scoped_identifier` child |
| class | `class_declaration` | `name` | `class_body` |
| record | `record_declaration` | `name` | `record_body` (если есть) |
| interface | `interface_declaration` | `name` | `interface_body` |
| annotation type | `annotation_type_declaration` | `name` | `annotation_type_body` |
| enum | `enum_declaration` | `name` | `enum_body` |
| method | `method_declaration` | `name` | `block` |
| constructor | `constructor_declaration` | `name` | `constructor_body` |
| annotation | `marker_annotation` / `annotation` | — | — |
| Javadoc | `block_comment` (starts with `/**`) | — | — |

**Важно:** эта таблица — предварительная. Реальные node types могут отличаться. Шаг 6.2 верифицирует их.

---

## Шаг 6.3 — Реализация java-extractor.ts

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/java-extractor.ts` | **Создать** |

### Интерфейс

```typescript
import type { ExtractedNode, SyntaxNode } from './extractor-types.js';
import { toLine, extractName, captureLeadingAnnotations } from './extractor-types.js';

export function extractNodes(rootNode: SyntaxNode): ExtractedNode[];
```

### Логика

#### 1. Package extraction

```typescript
function extractPackage(rootNode: SyntaxNode): string | null {
  // Найти package_declaration в children корня.
  for (const child of rootNode.children) {
    if (child.type === 'package_declaration') {
      // Извлечь scoped_identifier.
      const scopedId = child.children.find(
        (c: SyntaxNode) => c.type === 'scoped_identifier' || c.type === 'identifier'
      );
      return scopedId ? scopedId.text : null;
    }
  }
  return null;
}
```

#### 2. Основной обход

```typescript
function visitNode(
  node: SyntaxNode,
  result: ExtractedNode[],
  packageName: string | null,
  classStack: string[],  // Стек имён классов для FQN.
): void {
  switch (node.type) {
  case 'class_declaration':
    handleClass(node, result, packageName, classStack, undefined);
    return;
  case 'record_declaration':
    handleClass(node, result, packageName, classStack, 'RECORD');
    return;
  case 'interface_declaration':
    handleInterface(node, result, packageName, classStack, undefined);
    return;
  case 'annotation_type_declaration':
    handleInterface(node, result, packageName, classStack, 'ANNOTATION_TYPE');
    return;
  case 'enum_declaration':
    handleEnum(node, result, packageName, classStack);
    return;
  case 'method_declaration':
    handleMethod(node, result, packageName, classStack);
    return;
  case 'constructor_declaration':
    handleConstructor(node, result, packageName, classStack);
    return;
  default:
    // Обход children для program, class_body, interface_body и т.д.
    for (const child of node.children) {
      visitNode(child, result, packageName, classStack);
    }
  }
}
```

#### 3. handleClass (class + record)

- Извлечь имя через `extractName(node)`.
- Сформировать FQN: `[package.]ClassName`.
- `captureLeadingAnnotations()` для захвата аннотаций/Javadoc.
- Создать ExtractedNode (fragmentType: 'CLASS', fragmentSubtype: subtype или undefined).
- **Не** рекурсивно извлекать nested classes как отдельные CLASS-чанки.
- **Да** рекурсивно обходить `class_body` / `record_body` для извлечения методов — с обновлённым classStack.

#### 4. handleMethod / handleConstructor

- Извлечь имя через `extractName(node)`.
- FQN: `[package.]ClassName.methodName` (из classStack).
- `captureLeadingAnnotations()` для `marker_annotation`, `annotation`, `block_comment`.
- fragmentType: 'METHOD', fragmentSubtype: 'CONSTRUCTOR' для конструкторов.

#### 5. handleInterface / handleEnum

- Аналогично handleClass, но fragmentType: 'INTERFACE' / 'ENUM'.
- Для annotation_type_declaration: fragmentSubtype: 'ANNOTATION_TYPE'.

#### 6. Аннотации и Javadoc capture

Типы annotation-нод для Java:
- `marker_annotation` — `@Override`
- `annotation` — `@SuppressWarnings("unchecked")`

Типы комментариев:
- `block_comment` — `/** Javadoc */` и `/* обычный */`
- `line_comment` — `// комментарий`

Использовать `captureLeadingAnnotations(node, ['marker_annotation', 'annotation'], ['block_comment', 'line_comment'])`.

---

## Шаг 6.4 — Подключение java-extractor в tree-sitter-chunker

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/tree-sitter-chunker.ts` | Обновить getExtractor() |

### Изменения

```typescript
import { extractNodes as extractJavaNodes } from './java-extractor.js';

function getExtractor(langName: string): ExtractorFn {
  switch (langName) {
  case 'typescript':
  case 'tsx':
  case 'javascript':
  case 'jsx':
    return extractTsNodes;
  case 'java':
    return extractJavaNodes;  // Заменяем заглушку.
  case 'kotlin':
    return () => [];  // Пока заглушка.
  default:
    return () => [];
  }
}
```

---

## Шаг 6.5 — Юнит-тесты java-extractor (моки)

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/__tests__/java-extractor.test.ts` | **Создать** |

### Хелпер: мок SyntaxNode

```typescript
// Фабрика мок-нод для тестирования экстрактора без tree-sitter.
function mockNode(overrides: Partial<{
  type: string;
  text: string;
  children: any[];
  startPosition: { row: number };
  endPosition: { row: number };
  childForFieldName: (name: string) => any;
  previousSibling: any;
  parent: any;
}>): any {
  return {
    type: 'program',
    text: '',
    children: [],
    startPosition: { row: 0 },
    endPosition: { row: 0 },
    childForFieldName: () => null,
    previousSibling: null,
    parent: null,
    ...overrides,
  };
}
```

### Тест-кейсы

1. **Пустой файл** → `[]`.
2. **Класс с методами** → CLASS + METHOD чанки.
   - FQN: `MyService`, `MyService.doWork`.
3. **Record** → CLASS (subtype: 'RECORD').
   - FQN: `Point`.
4. **Annotation type** → INTERFACE (subtype: 'ANNOTATION_TYPE').
5. **Enum** → ENUM.
6. **Package** → FQN включает package.
   - `com.example.MyService`, `com.example.MyService.doWork`.
7. **Аннотации перед методом** → startLine расширен, text включает аннотацию.
8. **Javadoc перед классом** → startLine расширен.
9. **Nested class methods** → FQN = `com.example.Outer.Inner.innerMethod`.
10. **Конструктор** → METHOD (subtype: 'CONSTRUCTOR').
11. **Без package** → FQN без префикса.

---

## Шаг 6.6 — Интеграционные тесты Java (реальный парсинг)

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/__tests__/java-integration.test.ts` | **Создать** |

### Структура

```typescript
import { describe, it, expect } from 'vitest';
import { TreeSitterChunker } from '../tree-sitter-chunker.js';
import { isTreeSitterSupported } from '../languages.js';
import type { FileContent } from '../../types.js';

// Пропустить если tree-sitter-java не установлен.
const javaAvailable = isTreeSitterSupported('Test.java');

describe.skipIf(!javaAvailable)('Java tree-sitter integration', () => {
  const config = { maxTokens: 500, overlap: 50 };

  it('supports() для .java', () => {
    const chunker = new TreeSitterChunker(config);
    expect(chunker.supports('Test.java')).toBe(true);
  });

  it('класс с методом → CLASS + METHOD', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example;',
      '',
      'public class MyService {',
      '  public void doWork() {',
      '    System.out.println("work");',
      '  }',
      '}',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'MyService.java'));

    const classChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
    expect(classChunk).toBeDefined();
    expect(classChunk!.metadata.fqn).toBe('com.example.MyService');

    const methodChunk = result.find(c => c.metadata.fragmentType === 'METHOD');
    expect(methodChunk).toBeDefined();
    expect(methodChunk!.metadata.fqn).toBe('com.example.MyService.doWork');
  });

  it('record → CLASS subtype RECORD', () => { /* ... */ });
  it('enum → ENUM', () => { /* ... */ });
  it('аннотации включены в чанк метода', () => { /* ... */ });
  it('Javadoc включён в чанк класса', () => { /* ... */ });
  it('metadata: language === java', () => { /* ... */ });
  it('корректные startLine/endLine', () => { /* ... */ });
  it('oversized класс → несколько чанков', () => { /* ... */ });
});
```

---

## Шаг 6.7 — Тест graceful degradation для Java

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/__tests__/java-degradation.test.ts` | **Создать** |

### Тест-кейсы

1. **Мок ошибки загрузки** tree-sitter-java:
   - `isTreeSitterSupported('Test.java')` → `false`.
   - `console.warn` вызван с сообщением про FallbackChunker.
   - Warning логируется один раз.
2. **strictAst: true + ошибка загрузки** → throw Error.
3. **FallbackChunker подхватывает** `.java` файл при отсутствии tree-sitter-java:
   - ChunkDispatcher → TreeSitterChunker.supports() = false → FallbackChunker.supports() = true → fallback-чанки.

---

## Чеклист завершения фазы 6

- [ ] `tree-sitter-java` в optionalDependencies, установлен и работает
- [ ] AST node types исследованы и задокументированы
- [ ] `java-extractor.ts` реализован (package, class, record, interface, annotation type, enum, method, constructor)
- [ ] Аннотации/Javadoc capture работает
- [ ] FQN включает package
- [ ] Nested class methods с корректным FQN
- [ ] fragmentSubtype для record, annotation type, constructor
- [ ] `getExtractor('java')` возвращает `extractJavaNodes`
- [ ] Юнит-тесты java-extractor (моки) проходят
- [ ] Интеграционные тесты (реальный парсинг) проходят
- [ ] Graceful degradation тесты проходят
- [ ] `npm run build && npm run lint && npm test` — OK
