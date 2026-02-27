# Спецификация: tree-sitter поддержка Java и Kotlin

## 1. Обзор

Добавить полноценную tree-sitter AST-поддержку Java и Kotlin в систему Local RAG. Заменить текущий FallbackChunker (разбивка по пустым строкам) на семантический парсинг с извлечением классов, методов, интерфейсов и языко-специфичных конструкций.

**Scope:** general-purpose — качественное покрытие для любых Java/Kotlin проектов (Spring Boot, Android, Kotlin Multiplatform), не только KariPos.

## 2. Решения по дизайну

### 2.1. Глубина AST-извлечения

**Базовые + ключевые идиомы:**

| Конструкция | FragmentType | FragmentSubtype |
|---|---|---|
| class | CLASS | — |
| interface | INTERFACE | — |
| method | METHOD | — |
| function (Kotlin top-level fun) | FUNCTION | — |
| enum | ENUM | — |
| Kotlin data class | CLASS | DATA_CLASS |
| Kotlin sealed class | CLASS | SEALED_CLASS |
| Kotlin object | CLASS | OBJECT |
| Kotlin companion object | CLASS | COMPANION_OBJECT |
| Java record | CLASS | RECORD |
| Kotlin extension function | FUNCTION | EXTENSION_FUNCTION |
| Java annotation type | INTERFACE | ANNOTATION_TYPE |

### 2.2. FragmentType + FragmentSubtype (не ломающий контракт)

Текущий `fragmentType` (`'CLASS' | 'INTERFACE' | 'FUNCTION' | 'METHOD' | 'ENUM' | 'TYPE'`) остаётся **стабильным**.

Новое поле `fragmentSubtype?: string` добавляется в `ChunkMetadata` для расширенной семантики. Потребители, работающие только с `fragmentType`, продолжают работать без изменений. Те, кому нужна точная семантика — используют `fragmentSubtype`.

### 2.3. FQN с package

Для Java/Kotlin FQN включает package:

```
com.kari.pos.ui.MainActivity.onCreate
com.example.utils.StringExtensions.toSlug
```

Package извлекается из корневого узла AST (`package_declaration` в Java, `package_header` в Kotlin).

Для TS/JS поведение FQN не меняется (нет package).

### 2.4. Вложенные классы

Стратегия: **класс целиком + методы отдельно**.

- Класс извлекается целиком (включая nested/inner classes внутри).
- Все методы (включая методы nested classes) извлекаются как отдельные чанки с FQN = `package.Outer.Inner.method`.
- Nested/inner классы **не** извлекаются как отдельные чанки CLASS.
- Companion object **не** извлекается отдельно (попадает в чанк класса), но его методы — да, с FQN = `package.MyClass.Companion.create`.

### 2.5. Аннотации и Javadoc/KDoc

При извлечении метода/класса как чанка — захватить предшествующие аннотации и документирующие комментарии. Расширить `startLine` вверх, чтобы включить:

- Java: `@Override`, `@Nullable`, Javadoc (`/** */`)
- Kotlin: аннотации (`@JvmStatic`, `@Serializable`), KDoc

Реализация: проверять `previousSibling` узла в AST на тип `annotation` / `marker_annotation` / `comment` / `multiline_comment`.

### 2.6. Kotlin extension functions

FQN = `package.functionName` (без receiver в FQN).

Семантика через метаданные:
- `fragmentSubtype: 'EXTENSION_FUNCTION'`
- `receiverType: 'String'` (новое поле в ChunkMetadata)

### 2.7. Kotlin top-level properties

Группировать соседние top-level `val`/`var` в один чанк. Не создавать отдельный чанк на каждую property — это даёт мелкие бесполезные чанки. Группа = последовательные property_declaration без разделения другими конструкциями.

### 2.8. Metadata расширение

Новые optional-поля в `ChunkMetadata`:

```typescript
interface ChunkMetadata {
  // Существующие поля (без изменений).
  path: string;
  sourceType: 'code' | 'markdown' | 'text' | 'pdf';
  language?: string;
  fqn?: string;
  fragmentType?: FragmentType;
  startLine?: number;
  endLine?: number;

  // Новые поля.
  fragmentSubtype?: string;    // DATA_CLASS, SEALED_CLASS, OBJECT, COMPANION_OBJECT, RECORD, EXTENSION_FUNCTION, ANNOTATION_TYPE
  receiverType?: string;       // Для Kotlin extension functions — тип receiver
}
```

Миграция БД не требуется: `fragmentSubtype` и `receiverType` хранятся в JSONB metadata.

## 3. Архитектура

### 3.1. Экстракторы по языкам

Текущий `ast-extractor.ts` переименовывается в `ts-extractor.ts`. Создаются новые:

```
src/chunks/code/
├── ts-extractor.ts        # TS/JS/TSX/JSX (бывший ast-extractor.ts)
├── java-extractor.ts      # Java
├── kotlin-extractor.ts    # Kotlin
├── extractor-types.ts     # Общий интерфейс ExtractedNode, FragmentType, утилиты
├── tree-sitter-chunker.ts # Без изменений логики, обновлённые импорты
├── fallback-chunker.ts    # Без изменений
└── languages.ts           # Расширен Java/Kotlin
```

Общий интерфейс:

```typescript
// extractor-types.ts
export type FragmentType = 'CLASS' | 'INTERFACE' | 'FUNCTION' | 'METHOD' | 'ENUM' | 'TYPE';

export interface ExtractedNode {
  fragmentType: FragmentType;
  fragmentSubtype?: string;
  fqn: string;
  startLine: number;
  endLine: number;
  text: string;
  receiverType?: string;
}

// Каждый экстрактор экспортирует:
export function extractNodes(rootNode: SyntaxNode): ExtractedNode[];
```

### 3.2. languages.ts — расширение

```typescript
// Новые ленивые загрузчики.
let _javaLanguage: TreeSitterLanguage | null = null;
let _kotlinLanguage: TreeSitterLanguage | null = null;
let _javaLoadFailed = false;
let _kotlinLoadFailed = false;

function getJavaLanguage(): TreeSitterLanguage | null {
  if (_javaLoadFailed) return null;
  if (!_javaLanguage) {
    try {
      _javaLanguage = require('tree-sitter-java');
    } catch {
      _javaLoadFailed = true;
      console.warn('[local-rag] tree-sitter-java не установлен. Java файлы будут обработаны FallbackChunker.');
      return null;
    }
  }
  return _javaLanguage;
}
// Аналогично для Kotlin.

// getLanguageForFile — расширенный switch.
case '.java':
  { const lang = getJavaLanguage();
    return lang ? { language: lang, name: 'java' } : null; }
case '.kt':
case '.kts':
  { const lang = getKotlinLanguage();
    return lang ? { language: lang, name: 'kotlin' } : null; }
```

**Динамический supports():** `isTreeSitterSupported()` возвращает `true` для `.java`/`.kt` только если грамматика успешно загрузилась. Иначе `false`, и ChunkDispatcher передаёт файл FallbackChunker.

Warning логируется **один раз** при первой попытке загрузки.

### 3.3. Parser cache

TreeSitterChunker кеширует Parser per language:

```typescript
private readonly parsers = new Map<string, any>();

private getParser(langName: string, language: TreeSitterLanguage): any {
  let parser = this.parsers.get(langName);
  if (!parser) {
    const Parser = require('tree-sitter');
    parser = new Parser();
    parser.setLanguage(language);
    this.parsers.set(langName, parser);
  }
  return parser;
}
```

### 3.4. Graceful degradation + strictAst

**По умолчанию:** если tree-sitter-java или tree-sitter-kotlin не загружается — жёсткий warning в консоль + `rag status` показывает деградацию. Файлы обрабатываются FallbackChunker.

**strictAst режим:** опция в конфиге `indexing.strictAst: true` или CLI `--strict-ast`. При ошибке загрузки грамматики — индексация падает с ошибкой, а не деградирует.

```yaml
indexing:
  strictAst: false  # default
```

### 3.5. FallbackChunker

`.java` и `.kt` **остаются** в `EXTENSION_LANGUAGE` FallbackChunker. Это позволяет:
- FallbackChunker работает как fallback если tree-sitter грамматика не установлена.
- ChunkDispatcher проверяет TreeSitterChunker первым (dynamic supports), при false — FallbackChunker подхватывает.

### 3.6. tree-sitter-chunker.ts

Выбор экстрактора по языку:

```typescript
import { extractNodes as extractTsNodes } from './ts-extractor.js';
import { extractNodes as extractJavaNodes } from './java-extractor.js';
import { extractNodes as extractKotlinNodes } from './kotlin-extractor.js';

function getExtractor(langName: string) {
  switch (langName) {
    case 'typescript': case 'tsx': case 'javascript': case 'jsx':
      return extractTsNodes;
    case 'java':
      return extractJavaNodes;
    case 'kotlin':
      return extractKotlinNodes;
    default:
      return null;
  }
}
```

## 4. Java extractor — node types

| tree-sitter-java node type | FragmentType | FragmentSubtype |
|---|---|---|
| `class_declaration` | CLASS | — |
| `record_declaration` | CLASS | RECORD |
| `interface_declaration` | INTERFACE | — |
| `annotation_type_declaration` | INTERFACE | ANNOTATION_TYPE |
| `enum_declaration` | ENUM | — |
| `method_declaration` | METHOD | — |
| `constructor_declaration` | METHOD | CONSTRUCTOR |

**Package:** извлекается из `package_declaration` → `scoped_identifier`.

**Аннотации/Javadoc:** при извлечении method/class — проверить `previousSibling` на `marker_annotation`, `annotation`, `block_comment` (Javadoc). Расширить startLine/text.

## 5. Kotlin extractor — node types

| tree-sitter-kotlin node type | FragmentType | FragmentSubtype |
|---|---|---|
| `class_declaration` | CLASS | — |
| `class_declaration` (modifiers: data) | CLASS | DATA_CLASS |
| `class_declaration` (modifiers: sealed) | CLASS | SEALED_CLASS |
| `object_declaration` | CLASS | OBJECT |
| `companion_object` | CLASS | COMPANION_OBJECT |
| `interface_declaration` (если есть) | INTERFACE | — |
| `function_declaration` | FUNCTION / METHOD | — |
| `function_declaration` (с receiver) | FUNCTION | EXTENSION_FUNCTION |
| `enum_class_body` / enum | ENUM | — |

**Package:** извлекается из `package_header`.

**Extension functions:** проверить наличие `receiver_type` в `function_declaration`. Если есть:
- `fragmentSubtype = 'EXTENSION_FUNCTION'`
- `receiverType = receiver_type.text`

**Top-level properties:** группировать последовательные `property_declaration` на top-level в один чанк.

## 6. npm dependencies

```json
{
  "optionalDependencies": {
    "tree-sitter-java": "^0.23.0",
    "tree-sitter-kotlin": "^0.3.0"
  }
}
```

Версии подобрать совместимые с `tree-sitter@0.21.1` (ABI совместимость). Проверить при установке.

## 7. Тестирование

**Юнит-тесты экстракторов** (моки AST-нод):
- Мокировать tree-sitter SyntaxNode структуры.
- Тестировать логику извлечения FQN, fragmentType/fragmentSubtype, startLine/endLine.
- Тестировать package extraction, annotation capture.
- Не зависят от нативных модулей.

**Интеграционные тесты** (реальный парсинг):
- Реальные Java/Kotlin сниппеты → tree-sitter → chunker → проверка результатов.
- Зависят от tree-sitter-java/kotlin.
- Пометить `describe.skipIf()` если нативный модуль не установлен.

**Тест-кейсы Java:**
- Класс с методами → CLASS + METHOD чанки.
- Record → CLASS (subtype: RECORD).
- Annotation type → INTERFACE (subtype: ANNOTATION_TYPE).
- Package → FQN включает package.
- Аннотации перед методом → включены в чанк.
- Inner class → методы извлекаются с FQN `Outer.Inner.method`.

**Тест-кейсы Kotlin:**
- Data class → CLASS (subtype: DATA_CLASS).
- Object declaration → CLASS (subtype: OBJECT).
- Companion object → CLASS (subtype: COMPANION_OBJECT).
- Extension function → FUNCTION (subtype: EXTENSION_FUNCTION, receiverType).
- Top-level properties → группа в одном чанке.
- Package → FQN включает package.

**Тест graceful degradation:**
- Мокировать ошибку загрузки грамматики → supports() = false, warning в консоль.
- strictAst: true + ошибка загрузки → throw.

## 8. Этапы реализации

### Этап 1: Рефакторинг основы

- Переименовать `ast-extractor.ts` → `ts-extractor.ts`, обновить все импорты.
- Вынести `ExtractedNode`, `FragmentType` в `extractor-types.ts`.
- Добавить `fragmentSubtype?` и `receiverType?` в `ChunkMetadata` (types.ts).
- Добавить parser cache в `tree-sitter-chunker.ts` (Map<language, Parser>).
- Добавить `strictAst` в Zod-схему конфига.
- Реализовать динамический `supports()` в `languages.ts` (try/catch lazy load с fallback flag).
- Обновить `tree-sitter-chunker.ts` для выбора экстрактора по языку.
- Все существующие тесты проходят.

### Этап 2: Java tree-sitter

- Добавить `tree-sitter-java` в optionalDependencies.
- Реализовать `java-extractor.ts`:
  - Package extraction.
  - class, interface, enum, record, annotation type.
  - method, constructor.
  - Nested class methods с FQN.
  - Аннотации/Javadoc capture.
- Добавить `.java` в `languages.ts` (с graceful degradation).
- Юнит-тесты java-extractor (моки).
- Интеграционные тесты (реальный парсинг, skipIf).

### Этап 3: Kotlin tree-sitter

- Добавить `tree-sitter-kotlin` в optionalDependencies.
- Реализовать `kotlin-extractor.ts`:
  - Package extraction.
  - class, data class, sealed class, object, companion object.
  - function, method, extension function (receiverType).
  - Top-level property grouping.
  - Annotation/KDoc capture.
- Добавить `.kt`, `.kts` в `languages.ts` (с graceful degradation).
- Юнит-тесты kotlin-extractor (моки).
- Интеграционные тесты (реальный парсинг, skipIf).

## 9. Риски

| Риск | Митигация |
|---|---|
| **ABI несовместимость** tree-sitter-java/kotlin с tree-sitter@0.21.1 | Graceful degradation на FallbackChunker. Подобрать совместимые версии. |
| **tree-sitter-kotlin** менее стабилен (community-maintained) | Протестировать на реальном Kotlin-коде. Fallback есть. |
| **Kotlin AST node types** могут отличаться от документации | Исследовать реальное AST-дерево через tree-sitter playground перед реализацией. |
| **Большие Java файлы** (>1000 строк, God-classes) | Существующий splitOversizedNode разрежет по строкам. |
| **npm install время** увеличится из-за нативной компиляции | optionalDependencies — пользователь ставит только если нужно. |
