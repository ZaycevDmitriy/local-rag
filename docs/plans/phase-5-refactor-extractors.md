# Фаза 5: Рефакторинг — подготовка к Java/Kotlin tree-sitter

Цель: подготовить инфраструктуру для мультиязычных AST-экстракторов. Рефакторинг существующего кода без изменения поведения, расширение типов, parser cache, dynamic supports, strictAst.

**Предусловие:** все 178 тестов проходят на main. Фазы 1-4 завершены.

**Критерий завершения:** все существующие тесты проходят, новые тесты на рефакторинг проходят, `npm run build && npm run lint && npm test` — зелёные.

---

## Шаг 5.1 — Выделение extractor-types.ts

### Задача

Вынести `ExtractedNode`, `FragmentType` и утилиты из `ast-extractor.ts` в отдельный модуль `extractor-types.ts`. Это общий контракт для всех экстракторов (TS, Java, Kotlin).

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/extractor-types.ts` | **Создать** — типы и утилиты |
| `src/chunks/code/ast-extractor.ts` | Обновить импорты |
| `src/chunks/code/tree-sitter-chunker.ts` | Обновить импорты |

### extractor-types.ts

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SyntaxNode = any;

// Типы семантических узлов.
export type FragmentType = 'CLASS' | 'INTERFACE' | 'FUNCTION' | 'METHOD' | 'ENUM' | 'TYPE';

// Извлечённый семантический узел AST.
export interface ExtractedNode {
  fragmentType: FragmentType;
  // Расширенный тип фрагмента (DATA_CLASS, SEALED_CLASS, OBJECT и т.д.).
  fragmentSubtype?: string;
  // Полное квалифицированное имя (package.ClassName.methodName или просто name).
  fqn: string;
  startLine: number;
  endLine: number;
  text: string;
  // Тип receiver для Kotlin extension functions.
  receiverType?: string;
}

// Конвертирует строку tree-sitter (0-based) в 1-based.
export function toLine(row: number): number {
  return row + 1;
}

// Возвращает первое именованное дочернее поле name.
export function getNameNode(node: SyntaxNode): SyntaxNode | null {
  return node.childForFieldName('name') ?? null;
}

// Извлекает имя из узла объявления.
export function extractName(node: SyntaxNode): string | null {
  const nameNode = getNameNode(node);
  return nameNode ? nameNode.text : null;
}

// Собирает предшествующие аннотации и документирующие комментарии.
// Возвращает расширенный startLine и text с аннотациями.
export function captureLeadingAnnotations(
  node: SyntaxNode,
  annotationTypes: string[],
  commentTypes: string[],
): { startLine: number; prefix: string } {
  let current = node.previousSibling;
  let startLine = toLine(node.startPosition.row);
  let prefix = '';

  const allTypes = [...annotationTypes, ...commentTypes];
  const prefixParts: string[] = [];

  while (current && allTypes.includes(current.type)) {
    prefixParts.unshift(current.text);
    startLine = toLine(current.startPosition.row);
    current = current.previousSibling;
  }

  if (prefixParts.length > 0) {
    prefix = prefixParts.join('\n') + '\n';
  }

  return { startLine, prefix };
}

// Интерфейс функции-экстрактора.
export type ExtractorFn = (rootNode: SyntaxNode) => ExtractedNode[];
```

### Миграция из ast-extractor.ts

- Удалить из `ast-extractor.ts`: `type SyntaxNode`, `type FragmentType`, `interface ExtractedNode`, `function getNameNode`, `function extractName`, `function toLine`.
- Добавить в `ast-extractor.ts`: `import { ... } from './extractor-types.js'`.
- `tree-sitter-chunker.ts`: обновить `import type { ExtractedNode } from './ast-extractor.js'` → `import type { ExtractedNode } from './extractor-types.js'`.

### Тесты

- Все существующие тесты проходят без изменений (поведение не меняется).
- Юнит-тест `extractor-types.test.ts`:
  - `toLine(0) === 1`, `toLine(5) === 6`.
  - `extractName()` с мок-нодой.
  - `captureLeadingAnnotations()` с мок-нодами (annotation + comment → расширенный startLine и prefix).

---

## Шаг 5.2 — Переименование ast-extractor.ts → ts-extractor.ts

### Задача

Переименовать `ast-extractor.ts` в `ts-extractor.ts` для единообразия с будущими `java-extractor.ts` и `kotlin-extractor.ts`.

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/ast-extractor.ts` | **Переименовать** → `ts-extractor.ts` |
| `src/chunks/code/tree-sitter-chunker.ts` | Обновить импорт |
| `src/chunks/code/__tests__/tree-sitter-chunker.test.ts` | Проверить (импортирует через chunker, не напрямую) |

### Детали

- `git mv src/chunks/code/ast-extractor.ts src/chunks/code/ts-extractor.ts`.
- В `tree-sitter-chunker.ts`: `import { extractNodes } from './ast-extractor.js'` → `import { extractNodes } from './ts-extractor.js'`.
- `ts-extractor.ts` экспортирует `extractNodes` с той же сигнатурой: `(rootNode: SyntaxNode) => ExtractedNode[]`.

### Тесты

- Все существующие тесты проходят.
- `npm run build` — проходит (импорты корректны).

---

## Шаг 5.3 — Расширение ChunkMetadata

### Задача

Добавить `fragmentSubtype?` и `receiverType?` в `ChunkMetadata`. Миграция БД не нужна — поля хранятся в JSONB.

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/types.ts` | Добавить 2 поля в `ChunkMetadata` |

### Изменения в types.ts

```typescript
export interface ChunkMetadata {
  path: string;
  sourceType: 'code' | 'markdown' | 'text' | 'pdf';
  startLine?: number;
  endLine?: number;
  fqn?: string;
  fragmentType?: string;
  language?: string;
  headerPath?: string;
  headerLevel?: number;
  startOffset?: number;
  endOffset?: number;
  pageStart?: number;
  pageEnd?: number;
  // Расширенный тип фрагмента (DATA_CLASS, SEALED_CLASS, OBJECT, RECORD и т.д.).
  fragmentSubtype?: string;
  // Тип receiver для Kotlin extension functions (например 'String').
  receiverType?: string;
}
```

### Тесты

- Все существующие тесты проходят (optional поля, обратная совместимость).
- Проверить типы: `npm run typesCheck`.

---

## Шаг 5.4 — Parser cache в TreeSitterChunker

### Задача

Кешировать Parser per language вместо создания нового на каждый файл. Один parser на язык, `setLanguage()` один раз.

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/tree-sitter-chunker.ts` | Добавить parser cache |

### Изменения в tree-sitter-chunker.ts

Текущий код (в методе `chunk`):

```typescript
const Parser = require('tree-sitter') as any;
const parser = new Parser();
parser.setLanguage(langInfo.language);
const bufferSize = Math.max(file.content.length * 2, 65536);
const tree = parser.parse(file.content, null, { bufferSize });
```

Новый код:

```typescript
// Приватное поле класса.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
private readonly parsers = new Map<string, any>();

// Получить или создать parser для языка.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
private getParser(langName: string, language: any): any {
  let parser = this.parsers.get(langName);
  if (!parser) {
    const Parser = require('tree-sitter') as any;
    parser = new Parser();
    parser.setLanguage(language);
    this.parsers.set(langName, parser);
  }
  return parser;
}

// В chunk():
const parser = this.getParser(langInfo.name, langInfo.language);
const bufferSize = Math.max(file.content.length * 2, 65536);
const tree = parser.parse(file.content, null, { bufferSize });
```

### Тесты

- Все существующие тесты проходят (поведение идентично).
- Дополнительный тест: парсинг двух `.ts` файлов подряд — parser переиспользуется (можно проверить через шпион на `require('tree-sitter')`).

---

## Шаг 5.5 — Динамический supports() в languages.ts

### Задача

Расширить `languages.ts` для поддержки Java/Kotlin с graceful degradation. `getLanguageForFile()` возвращает `null` для `.java`/`.kt` если грамматика не установлена. Warning логируется один раз.

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/languages.ts` | Расширить lazy-загрузчики и switch |
| `src/chunks/code/__tests__/languages.test.ts` | **Создать** — тесты |

### Изменения в languages.ts

```typescript
// Новые ленивые загрузчики с graceful degradation.
let _javaLanguage: TreeSitterLanguage | null = null;
let _javaLoadFailed = false;
let _kotlinLanguage: TreeSitterLanguage | null = null;
let _kotlinLoadFailed = false;

function getJavaLanguage(): TreeSitterLanguage | null {
  if (_javaLoadFailed) return null;
  if (!_javaLanguage) {
    try {
      _javaLanguage = require('tree-sitter-java');
    } catch {
      _javaLoadFailed = true;
      console.warn(
        '[local-rag] tree-sitter-java не установлен. Java файлы будут обработаны FallbackChunker.'
      );
      return null;
    }
  }
  return _javaLanguage;
}

function getKotlinLanguage(): TreeSitterLanguage | null {
  if (_kotlinLoadFailed) return null;
  if (!_kotlinLanguage) {
    try {
      _kotlinLanguage = require('tree-sitter-kotlin');
    } catch {
      _kotlinLoadFailed = true;
      console.warn(
        '[local-rag] tree-sitter-kotlin не установлен. Kotlin файлы будут обработаны FallbackChunker.'
      );
      return null;
    }
  }
  return _kotlinLanguage;
}

// getLanguageForFile() — расширенный switch:
case '.java': {
  const lang = getJavaLanguage();
  return lang ? { language: lang, name: 'java' } : null;
}
case '.kt':
case '.kts': {
  const lang = getKotlinLanguage();
  return lang ? { language: lang, name: 'kotlin' } : null;
}
```

Также экспортировать функцию сброса состояния для тестов:

```typescript
// Для тестов: сброс состояния ленивых загрузчиков.
export function _resetLanguageCache(): void {
  _javaLanguage = null;
  _javaLoadFailed = false;
  _kotlinLanguage = null;
  _kotlinLoadFailed = false;
}
```

### Тесты (languages.test.ts)

- `.ts` → `{ name: 'typescript' }` (существующее поведение).
- `.java` → `null` если tree-sitter-java не установлен.
- `.java` → `{ name: 'java' }` если tree-sitter-java установлен (интеграционный, skipIf).
- `.kt` / `.kts` → аналогично.
- `isTreeSitterSupported('.java')` → динамический результат.
- Warning логируется один раз (мок console.warn, вызвать дважды — один console.warn).

---

## Шаг 5.6 — Выбор экстрактора по языку в tree-sitter-chunker.ts

### Задача

Обновить `tree-sitter-chunker.ts` для маршрутизации к нужному экстрактору по имени языка. На данном этапе Java/Kotlin экстракторы ещё не реализованы — используются заглушки, возвращающие `[]`.

### Файлы

| Файл | Действие |
|------|----------|
| `src/chunks/code/tree-sitter-chunker.ts` | Добавить getExtractor() |

### Изменения

```typescript
import { extractNodes as extractTsNodes } from './ts-extractor.js';
import type { ExtractorFn } from './extractor-types.js';

// Маршрутизация экстрактора по языку.
function getExtractor(langName: string): ExtractorFn {
  switch (langName) {
  case 'typescript':
  case 'tsx':
  case 'javascript':
  case 'jsx':
    return extractTsNodes;
  case 'java':
  case 'kotlin':
    // Заглушка — будет реализовано в фазах 6 и 7.
    return () => [];
  default:
    return () => [];
  }
}

// В chunk():
const extractor = getExtractor(langInfo.name);
const extractedNodes = extractor(tree.rootNode);
```

### Тесты

- Все существующие тесты проходят.
- Java/Kotlin файлы при наличии tree-sitter грамматики → парсятся, но экстрактор возвращает `[]` → весь файл как один code-чанк (существующее поведение для файлов без узлов).

---

## Шаг 5.7 — strictAst в конфиге

### Задача

Добавить `indexing.strictAst` в Zod-схему конфига. По умолчанию `false`. Если `true` — ошибка загрузки грамматики прерывает индексацию.

### Файлы

| Файл | Действие |
|------|----------|
| `src/config/schema.ts` | Добавить `strictAst` в IndexingConfigSchema |
| `src/chunks/code/languages.ts` | Добавить проверку strictAst |
| `src/config/__tests__/schema.test.ts` | Тест дефолта |

### Изменения в schema.ts

```typescript
export const IndexingConfigSchema = z.object({
  git: z.object({
    cloneDir: z.string().default('~/.local/share/rag/repos'),
  }).default(() => ({ cloneDir: '~/.local/share/rag/repos' })),
  chunkSize: z.object({
    maxTokens: z.number().default(1000),
    overlap: z.number().default(100),
  }).default(() => ({ maxTokens: 1000, overlap: 100 })),
  // Если true — ошибка загрузки tree-sitter грамматики прерывает индексацию.
  strictAst: z.boolean().default(false),
});
```

### Интеграция с languages.ts

Передавать `strictAst` через параметр или модульную переменную. При `strictAst: true` и неудачной загрузке грамматики — `throw new Error(...)` вместо `console.warn()` и `return null`.

```typescript
let _strictAst = false;

export function setStrictAst(value: boolean): void {
  _strictAst = value;
}

// В getJavaLanguage():
} catch {
  _javaLoadFailed = true;
  if (_strictAst) {
    throw new Error('[local-rag] tree-sitter-java не установлен. Установите: npm install tree-sitter-java');
  }
  console.warn('...');
  return null;
}
```

Вызов `setStrictAst(config.indexing.strictAst)` в CLI index-cmd.ts перед индексацией.

### Тесты

- Конфиг без `strictAst` → default `false`.
- Конфиг с `strictAst: true` → парсится корректно.
- `setStrictAst(true)` + отсутствие грамматики → throw.
- `setStrictAst(false)` + отсутствие грамматики → null + warning.

---

## Чеклист завершения фазы 5

- [ ] `extractor-types.ts` создан с типами и утилитами
- [ ] `ast-extractor.ts` переименован в `ts-extractor.ts`
- [ ] `ChunkMetadata` расширен (`fragmentSubtype`, `receiverType`)
- [ ] Parser cache реализован в `TreeSitterChunker`
- [ ] Динамический `supports()` для `.java`/`.kt`/`.kts` в `languages.ts`
- [ ] `getExtractor()` маршрутизация по языку в `tree-sitter-chunker.ts`
- [ ] `strictAst` в Zod-схеме и `languages.ts`
- [ ] `npm run build` — OK
- [ ] `npm run lint` — OK
- [ ] `npm test` — все тесты проходят (существующие + новые)
- [ ] `npm run typesCheck` — OK
