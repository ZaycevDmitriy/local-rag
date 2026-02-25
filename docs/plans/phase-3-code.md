# Фаза 3: Код

Цель: AST-парсинг кода через tree-sitter, fallback для остальных языков, Git-источники.

---

## Шаг 3.1 — tree-sitter chunker (TS/JS)

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/chunks/code/tree-sitter-chunker.ts` | TreeSitterChunker |
| `src/chunks/code/queries/typescript.ts` | tree-sitter queries для TS/JS |
| `src/chunks/code/__tests__/tree-sitter-chunker.test.ts` | Тесты |

### npm-зависимости

- `tree-sitter` — AST-парсер
- `tree-sitter-typescript` — грамматика TypeScript/TSX
- `tree-sitter-javascript` — грамматика JavaScript/JSX

### Ключевые интерфейсы

```typescript
// src/chunks/code/tree-sitter-chunker.ts

class TreeSitterChunker implements Chunker {
  supports(filePath: string): boolean;
  // .ts, .tsx, .js, .jsx

  chunk(file: FileContent): Chunk[];
  // 1. Парсинг AST через tree-sitter.
  // 2. Обход дерева через queries.
  // 3. Извлечение: классы, интерфейсы, функции, методы, enum-ы.
  // 4. Формирование FQN: ClassName.methodName.
  // 5. Установка fragmentType: CLASS | INTERFACE | METHOD | FUNCTION | ENUM.
}
```

### tree-sitter queries

Извлекаемые конструкции для TypeScript/JavaScript:

- `class_declaration` -> fragmentType: CLASS
- `interface_declaration` -> fragmentType: INTERFACE
- `method_definition` -> fragmentType: METHOD (FQN: ClassName.methodName)
- `function_declaration` -> fragmentType: FUNCTION
- `arrow_function` (export const) -> fragmentType: FUNCTION
- `enum_declaration` -> fragmentType: ENUM
- `type_alias_declaration` (export) -> fragmentType: TYPE

### ChunkMetadata для кода

```typescript
{
  path: 'src/services/auth.ts',
  sourceType: 'code',
  startLine: 15,
  endLine: 42,
  fqn: 'AuthService.login',
  fragmentType: 'METHOD',
  language: 'typescript',
}
```

### Регистрация в ChunkDispatcher

Добавить TreeSitterChunker в список chunkers с приоритетом перед FixedSizeChunker.

### Тесты

- Класс с методами -> отдельные чанки для класса и каждого метода
- Стрелочные функции с export -> чанки с FQN
- Интерфейсы -> чанки с fragmentType: INTERFACE
- Вложенные классы -> правильный FQN
- Enum -> fragmentType: ENUM

---

## Шаг 3.2 — Fallback chunker

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/chunks/code/fallback-chunker.ts` | FallbackChunker |
| `src/chunks/code/__tests__/fallback-chunker.test.ts` | Тесты |

### FallbackChunker

```typescript
class FallbackChunker implements Chunker {
  supports(filePath: string): boolean;
  // .py, .go, .rs, .java, .rb, .php, .c, .cpp, .h, .hpp, .cs, .swift, .kt

  chunk(file: FileContent): Chunk[];
  // 1. Разбиение по пустым строкам (двойной перенос строки).
  // 2. Группировка блоков по отступам.
  // 3. Если блок > maxTokens -> разрезание с overlap.
  // 4. sourceType: 'code', без FQN, без fragmentType.
}
```

### Метаданные

```typescript
{
  path: 'main.py',
  sourceType: 'code',
  startLine: 10,
  endLine: 25,
  language: 'python',  // Определяется по расширению.
}
```

### Регистрация в ChunkDispatcher

Добавить FallbackChunker после TreeSitterChunker, перед FixedSizeChunker.

### Тесты

- Python-файл: функции разделены пустыми строками
- Go-файл: функции с блоками
- Длинная функция -> разрезание с overlap

---

## Шаг 3.3 — Git-источники

### Файлы

| Файл | Назначение |
|------|-----------|
| `src/sources/git.ts` | GitSource — clone/pull |
| Модификация `src/commands/index-cmd.ts` | Добавление --git / --branch |

### GitSource

```typescript
// src/sources/git.ts

interface GitCloneResult {
  localPath: string;  // Путь к клонированному репозиторию.
}

async function cloneOrPull(
  url: string,
  branch: string,
  cloneDir: string,
): Promise<GitCloneResult>;
// Если репозиторий уже клонирован — git pull.
// Если нет — git clone --depth 1 --branch <branch>.
// Клонирует в cloneDir/<repo-name>.
```

### Интеграция

- `rag index --git <url> --branch <branch> --name <name>`
- Создает source с type: 'git', git_url, git_branch
- cloneOrPull -> scanLocalFiles(localPath) -> indexSource

### Конфиг

Используется `indexing.git.cloneDir` из конфига (default: `~/.local/share/rag/repos`).

### Тесты

- clone нового репозитория (мок git)
- pull существующего репозитория
- Интеграция с индексацией
