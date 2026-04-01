# Project Base Rules

> Конвенции проекта, обнаруженные автоматически из кодовой базы. Редактируйте по необходимости.

## Naming Conventions

- Файлы: kebab-case для команд (`index-cmd.ts`, `re-embed-cmd.ts`), camelCase/kebab-case для реализаций (`factory.ts`, `mcp-entry.ts`)
- Переменные: camelCase (`resolvedPath`, `sourceConfig`, `okCount`)
- Функции: camelCase с глагольными префиксами (`loadConfig`, `createTextEmbedder`, `resolveEnvVars`)
- Классы/интерфейсы: PascalCase (`SearchCoordinator`, `TextEmbedder`, `JinaReranker`)
- Константы: UPPER_SNAKE_CASE (`BATCH_SIZE`, `DEFAULT_BASE_URL`, `ENV_VAR_PATTERN`)

## Module Structure

- Feature-based организация: `src/config/`, `src/storage/`, `src/search/`, `src/indexer/` и т.д.
- Barrel exports через `index.ts` в каждом модуле
- ESM: обязательное расширение `.js` в импортах (`import { loadConfig } from '../config/index.js'`)
- Модули импортируют друг друга только через `index.ts`, прямые импорты внутренних файлов запрещены

## Error Handling

- Стандартные `try/catch` с проверкой `error instanceof Error ? error.message : String(error)`
- Нет кастомных классов ошибок, используется `throw new Error('описательное сообщение')`
- Ошибки всплывают до CLI-обработчиков, которые логируют и вызывают `process.exit(1)`
- Валидация через Zod-схемы (`AppConfigSchema.parse()`)

## Logging

- Прямой `console.log()` / `console.error()` без структурированного логирования
- MCP-сервер пишет логи в `console.error()` (stdout зарезервирован для протокола)
- CLI-команды: `console.log()` для пользовательского вывода, `console.error()` для ошибок

## Testing

- Vitest с `describe`/`it` паттерном
- Тесты в `__tests__/` рядом с исходниками, именование `*.test.ts`
- `beforeEach`/`afterEach` для setup/teardown
- Моки: `vi.fn()`, `vi.stubGlobal()`, `vi.restoreAllMocks()`
- Таймеры: `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()`
- Описания тестов на русском языке

## Code Style

- Single quotes, 2 spaces indentation, semicolons, trailing commas
- Комментарии и описания тестов на русском языке
- Имена переменных, функций, классов на английском языке
