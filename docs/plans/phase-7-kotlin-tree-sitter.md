# Фаза 7: Kotlin tree-sitter

Цель: полноценный tree-sitter AST-парсинг Kotlin-файлов с извлечением классов (data/sealed/object/companion), функций (включая extension), методов, enum-ов. FQN с package. Группировка top-level properties. Аннотации и KDoc включены в чанки.

**Предусловие:** фаза 6 завершена (Java tree-sitter работает, инфраструктура экстракторов готова).

**Критерий завершения:** Kotlin-файлы парсятся tree-sitter с корректным извлечением AST-узлов. Graceful degradation на FallbackChunker если tree-sitter-kotlin не установлен. Все тесты проходят.

---

## Шаг 7.1 — npm-зависимость tree-sitter-kotlin

### Задача

Добавить `tree-sitter-kotlin` в `optionalDependencies`. Подобрать версию, совместимую с `tree-sitter@0.21.1`.

### Действия

```bash
npm install --save-optional tree-sitter-kotlin
```

### Проверка совместимости

1. `npm install` — компиляция нативного модуля без ошибок.
2. Smoke-тест:

```javascript
const Parser = require('tree-sitter');
const Kotlin = require('tree-sitter-kotlin');
const parser = new Parser();
parser.setLanguage(Kotlin);
const tree = parser.parse('fun main() { println("hello") }');
console.log(tree.rootNode.type); // 'source_file'
```

3. **Важно:** `tree-sitter-kotlin` — community-maintained, менее стабилен чем tree-sitter-java. Возможные проблемы:
   - ABI несовместимость — попробовать другую версию.
   - Неполная грамматика — некоторые конструкции могут не парситься.
   - Если не работает — задокументировать и оставить на FallbackChunker.

### Файлы

| Файл | Действие |
|------|----------|
| `package.json` | Добавить `optionalDependencies.tree-sitter-kotlin` |

### Альтернативные пакеты

Если `tree-sitter-kotlin` не совместим, проверить:
- `@AladdinTechnologies/tree-sitter-kotlin`
- `tree-sitter-kotlin-treesitter-15` (для другой tree-sitter ABI)
- Собрать грамматику из [fwcd/tree-sitter-kotlin](https://github.com/fwcd/tree-sitter-kotlin) вручную.

---

## Шаг 7.2 — Исследование Kotlin AST node types

### Задача

Исследовать реальное AST-дерево tree-sitter-kotlin. Node types могут существенно отличаться от Java.

### Метод

Парсить Kotlin-сниппеты и выводить AST-дерево:

```kotlin
package com.example

import kotlin.annotation.AnnotationTarget

/**
 * KDoc для класса.
 */
@Deprecated("use NewService")
data class User(val name: String, val age: Int)

sealed class Result {
    data class Success(val data: String) : Result()
    data class Error(val message: String) : Result()
}

object Singleton {
    fun doWork() {}
}

class MyService {
    companion object {
        fun create(): MyService = MyService()
    }

    fun process(data: String) {}
}

fun String.toSlug(): String = this.lowercase().replace(" ", "-")

val API_URL = "https://api.example.com"
val TIMEOUT = 30_000
val MAX_RETRIES = 3

enum class Status { ACTIVE, INACTIVE }

interface Repository {
    fun findAll(): List<Any>
}
```

### Документировать

| Конструкция | Ожидаемый node type | Поле name | Тело |
|---|---|---|---|
| package | `package_header` | — | identifier |
| class | `class_declaration` | `name` (simple_identifier) | `class_body` |
| data class | `class_declaration` + `modifiers` содержит `data` | — | — |
| sealed class | `class_declaration` + `modifiers` содержит `sealed` | — | — |
| object | `object_declaration` | `name` | `class_body` |
| companion object | `companion_object` | `name`? | `class_body` |
| interface | `interface_declaration` (или аналог) | `name` | — |
| function | `function_declaration` | `name` | `function_body` |
| extension function | `function_declaration` + `receiver_type` поле | — | — |
| enum | `class_declaration` + `enum` modifier / `enum_class_body` | — | — |
| property | `property_declaration` | `name` (variable_declaration) | — |
| annotation | `annotation` | — | — |
| KDoc | `multiline_comment` (starts with `/**`) | — | — |

**Важно:** эта таблица — предварительная гипотеза. Реальные node types будут верифицированы в шаге 7.2.

---

## Шаг 7.3 — Реализация kotlin-extractor.ts

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/kotlin-extractor.ts` | **Создать** |

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
  for (const child of rootNode.children) {
    if (child.type === 'package_header') {
      // Извлечь identifier.
      const ident = child.children.find(
        (c: SyntaxNode) => c.type === 'identifier'
      );
      return ident ? ident.text : null;
    }
  }
  return null;
}
```

#### 2. Определение модификаторов (data, sealed, enum)

```typescript
// Проверить наличие модификатора в modifiers ноде.
function hasModifier(node: SyntaxNode, modifier: string): boolean {
  const modifiers = node.childForFieldName('modifiers')
    ?? node.children.find((c: SyntaxNode) => c.type === 'modifiers');
  if (!modifiers) return false;
  return modifiers.children.some(
    (c: SyntaxNode) => c.type === modifier || c.text === modifier
  );
}
```

#### 3. Основной обход

```typescript
function visitNode(
  node: SyntaxNode,
  result: ExtractedNode[],
  packageName: string | null,
  classStack: string[],
): void {
  switch (node.type) {
  case 'class_declaration':
    handleClass(node, result, packageName, classStack);
    return;
  case 'object_declaration':
    handleObject(node, result, packageName, classStack);
    return;
  case 'companion_object':
    handleCompanionObject(node, result, packageName, classStack);
    return;
  case 'interface_declaration':
    handleInterface(node, result, packageName, classStack);
    return;
  case 'function_declaration':
    handleFunction(node, result, packageName, classStack);
    return;
  case 'property_declaration':
    // Только top-level — группируем в шаге 7.3.5.
    break;
  default:
    for (const child of node.children) {
      visitNode(child, result, packageName, classStack);
    }
  }
}
```

#### 4. handleClass

- Определить subtype:
  - `hasModifier(node, 'data')` → `'DATA_CLASS'`
  - `hasModifier(node, 'sealed')` → `'SEALED_CLASS'`
  - `hasModifier(node, 'enum')` → fragmentType: `'ENUM'` (не CLASS)
  - Иначе → обычный CLASS.
- FQN: `[package.]ClassName`.
- `captureLeadingAnnotations()` для аннотаций/KDoc.
- Обход class_body для методов — с обновлённым classStack.
- Nested classes **не** извлекаются как отдельные CLASS, но их методы — да.

#### 5. handleObject / handleCompanionObject

- `object_declaration` → fragmentType: 'CLASS', subtype: 'OBJECT'.
- `companion_object` → fragmentType: 'CLASS', subtype: 'COMPANION_OBJECT'.
- Имя companion: `node.childForFieldName('name')?.text ?? 'Companion'`.
- Обход body для методов.

#### 6. handleFunction (top-level + методы + extension)

- Проверить receiver_type:
  ```typescript
  const receiverType = node.childForFieldName('receiver_type');
  ```
- Если `receiverType` и `classStack.length === 0`:
  - fragmentType: 'FUNCTION', fragmentSubtype: 'EXTENSION_FUNCTION'.
  - receiverType: `receiverType.text`.
- Если `classStack.length > 0` → fragmentType: 'METHOD'.
- Иначе → fragmentType: 'FUNCTION'.
- FQN: `[package.][ClassStack.]funcName`.

#### 7. Top-level properties — группировка

После основного обхода — отдельный проход по children корня для группировки последовательных `property_declaration`:

```typescript
function groupTopLevelProperties(
  rootNode: SyntaxNode,
  packageName: string | null,
): ExtractedNode[] {
  const groups: SyntaxNode[][] = [];
  let currentGroup: SyntaxNode[] = [];

  for (const child of rootNode.children) {
    if (child.type === 'property_declaration') {
      currentGroup.push(child);
    } else if (currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [];
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups.map(group => {
    const first = group[0]!;
    const last = group[group.length - 1]!;
    const text = group.map(n => n.text).join('\n');
    const fqnPrefix = packageName ? `${packageName}.` : '';
    return {
      fragmentType: 'FUNCTION' as const,  // Ближайший подходящий тип.
      fragmentSubtype: 'PROPERTIES',
      fqn: `${fqnPrefix}_properties_${toLine(first.startPosition.row)}`,
      startLine: toLine(first.startPosition.row),
      endLine: toLine(last.endPosition.row),
      text,
    };
  });
}
```

#### 8. Аннотации и KDoc capture

Типы annotation-нод для Kotlin:
- `annotation` — `@Deprecated("reason")`, `@JvmStatic`

Типы комментариев:
- `multiline_comment` — `/** KDoc */` и `/* обычный */`
- `line_comment` — `// комментарий`

Использовать `captureLeadingAnnotations(node, ['annotation'], ['multiline_comment', 'line_comment'])`.

---

## Шаг 7.4 — Подключение kotlin-extractor в tree-sitter-chunker

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/tree-sitter-chunker.ts` | Обновить getExtractor() |

### Изменения

```typescript
import { extractNodes as extractKotlinNodes } from './kotlin-extractor.js';

function getExtractor(langName: string): ExtractorFn {
  switch (langName) {
  case 'typescript':
  case 'tsx':
  case 'javascript':
  case 'jsx':
    return extractTsNodes;
  case 'java':
    return extractJavaNodes;
  case 'kotlin':
    return extractKotlinNodes;  // Заменяем заглушку.
  default:
    return () => [];
  }
}
```

---

## Шаг 7.5 — Юнит-тесты kotlin-extractor (моки)

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/__tests__/kotlin-extractor.test.ts` | **Создать** |

### Тест-кейсы

1. **Пустой файл** → `[]`.
2. **Обычный класс с методом** → CLASS + METHOD.
   - FQN: `com.example.MyService`, `com.example.MyService.process`.
3. **Data class** → CLASS (subtype: 'DATA_CLASS').
   - FQN: `com.example.User`.
4. **Sealed class** → CLASS (subtype: 'SEALED_CLASS').
5. **Object declaration** → CLASS (subtype: 'OBJECT').
   - FQN: `com.example.Singleton`.
6. **Companion object** → CLASS (subtype: 'COMPANION_OBJECT').
   - Методы companion: FQN = `com.example.MyService.Companion.create`.
7. **Extension function** → FUNCTION (subtype: 'EXTENSION_FUNCTION', receiverType: 'String').
   - FQN: `com.example.toSlug`.
8. **Top-level function** → FUNCTION.
9. **Top-level properties** → группа в одном чанке, fragmentSubtype: 'PROPERTIES'.
10. **Enum class** → ENUM.
11. **Interface** → INTERFACE.
12. **Package** → FQN включает package.
13. **Без package** → FQN без префикса.
14. **Аннотации перед функцией** → startLine расширен, text включает аннотацию.
15. **KDoc перед классом** → startLine расширен.
16. **Nested class methods** → FQN = `com.example.Outer.Inner.method`.

---

## Шаг 7.6 — Интеграционные тесты Kotlin (реальный парсинг)

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/__tests__/kotlin-integration.test.ts` | **Создать** |

### Структура

```typescript
import { describe, it, expect } from 'vitest';
import { TreeSitterChunker } from '../tree-sitter-chunker.js';
import { isTreeSitterSupported } from '../languages.js';
import type { FileContent } from '../../types.js';

const kotlinAvailable = isTreeSitterSupported('Test.kt');

describe.skipIf(!kotlinAvailable)('Kotlin tree-sitter integration', () => {
  const config = { maxTokens: 500, overlap: 50 };

  it('supports() для .kt', () => {
    const chunker = new TreeSitterChunker(config);
    expect(chunker.supports('Test.kt')).toBe(true);
  });

  it('supports() для .kts', () => {
    const chunker = new TreeSitterChunker(config);
    expect(chunker.supports('build.gradle.kts')).toBe(true);
  });

  it('data class → CLASS subtype DATA_CLASS', () => {
    const chunker = new TreeSitterChunker(config);
    const content = [
      'package com.example',
      '',
      'data class User(val name: String, val age: Int)',
    ].join('\n');
    const result = chunker.chunk(makeFile(content, 'User.kt'));

    const classChunk = result.find(c => c.metadata.fragmentType === 'CLASS');
    expect(classChunk).toBeDefined();
    expect(classChunk!.metadata.fqn).toBe('com.example.User');
    expect(classChunk!.metadata.fragmentSubtype).toBe('DATA_CLASS');
  });

  it('object → CLASS subtype OBJECT', () => { /* ... */ });
  it('companion object methods → корректный FQN', () => { /* ... */ });
  it('extension function → subtype + receiverType', () => { /* ... */ });
  it('top-level properties → группировка', () => { /* ... */ });
  it('sealed class → SEALED_CLASS', () => { /* ... */ });
  it('enum class → ENUM', () => { /* ... */ });
  it('metadata: language === kotlin', () => { /* ... */ });
  it('аннотации включены в чанк', () => { /* ... */ });
  it('KDoc включён в чанк', () => { /* ... */ });
  it('oversized класс → несколько чанков', () => { /* ... */ });
});
```

---

## Шаг 7.7 — Тест graceful degradation для Kotlin

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/__tests__/kotlin-degradation.test.ts` | **Создать** |

### Тест-кейсы

1. **Мок ошибки загрузки** tree-sitter-kotlin:
   - `isTreeSitterSupported('Test.kt')` → `false`.
   - `console.warn` вызван с сообщением про FallbackChunker.
   - Warning логируется один раз (повторный вызов — без warn).
2. **strictAst: true + ошибка загрузки** → throw Error.
3. **FallbackChunker подхватывает** `.kt` файл:
   - ChunkDispatcher → TreeSitterChunker.supports() = false → FallbackChunker.supports() = true → fallback-чанки с `language: 'kotlin'`.

---

## Шаг 7.8 — Обновление документации и rag status

### Задача

Обновить `rag status` для отображения деградации Java/Kotlin.

### Файлы

| Файл | Действие |
|------|----------|
| `src/commands/status-cmd.ts` | Добавить секцию tree-sitter languages |
| `src/mcp/tools/status.ts` | Добавить информацию в MCP status |

### Пример вывода rag status

```
Tree-sitter languages:
  TypeScript/TSX:  active
  JavaScript/JSX:  active
  Java:            active (tree-sitter-java)
  Kotlin:          fallback (tree-sitter-kotlin не установлен)
```

Или через MCP status tool:

```json
{
  "treeSitterLanguages": {
    "typescript": "active",
    "javascript": "active",
    "java": "active",
    "kotlin": "fallback"
  }
}
```

### Реализация

Импортировать `isTreeSitterSupported` из languages.ts и проверить каждый язык.

---

## Чеклист завершения фазы 7

- [ ] `tree-sitter-kotlin` в optionalDependencies, установлен и работает (или задокументирована несовместимость)
- [ ] AST node types исследованы и задокументированы
- [ ] `kotlin-extractor.ts` реализован:
  - [ ] Package extraction
  - [ ] class (обычный, data, sealed)
  - [ ] object declaration
  - [ ] companion object + его методы
  - [ ] function (top-level, method)
  - [ ] extension function (subtype + receiverType)
  - [ ] enum class
  - [ ] interface
  - [ ] top-level property grouping
  - [ ] annotation/KDoc capture
- [ ] FQN включает package
- [ ] Nested class methods с корректным FQN
- [ ] `getExtractor('kotlin')` возвращает `extractKotlinNodes`
- [ ] Юнит-тесты kotlin-extractor (моки) проходят
- [ ] Интеграционные тесты (реальный парсинг) проходят
- [ ] Graceful degradation тесты проходят
- [ ] `rag status` показывает статус tree-sitter языков
- [ ] MCP status tool показывает `treeSitterLanguages`
- [ ] `npm run build && npm run lint && npm test` — OK

---

## Финальная верификация (после фаз 5-7)

```bash
# Сборка и тесты.
npm run build && npm run lint && npm test && npm run typesCheck

# Проверка на реальном Java-проекте (при наличии).
rag index --path /path/to/java-project --name java-test
rag status

# Проверка на реальном Kotlin-проекте (при наличии).
rag index --path /path/to/kotlin-project --name kotlin-test

# MCP — поиск по Java/Kotlin коду.
npx @modelcontextprotocol/inspector node dist/mcp-entry.js
# → search "MainActivity onCreate"
# → search "data class User"
```
