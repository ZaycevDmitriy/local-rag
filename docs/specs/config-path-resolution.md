# Спецификация: Улучшение поиска пути к конфигу

## 1. Контекст и проблема

### Текущее поведение

`mcp-entry.ts` вызывает `loadConfig()` без аргументов. Функция `resolveConfigPath` ищет конфиг
в следующем порядке:

1. Переданный аргумент `configPath` (программный — нет UI для его задания в MCP-режиме).
2. `./rag.config.yaml` — **относительно CWD процесса**.
3. `~/.config/rag/config.yaml` — глобальный путь.

### Корень проблемы

При запуске как **глобального MCP-сервера** (через `~/.claude.json`) Claude Code устанавливает
CWD процесса в директорию текущего проекта пользователя — например,
`/Users/user/Work/my-project`. Файл `rag.config.yaml` там не существует.

Третий шаг (глобальный путь) работает, но требует ручного копирования конфига, что создаёт
проблему синхронизации двух файлов.

### Симптом

```
MCP server startup error: Jina embeddings config is required when provider is "jina"
```

Ошибка вводит в заблуждение: она говорит о невалидном конфиге, хотя истинная причина — конфиг
вообще не найден, и используются дефолты, не содержащие настройки Jina.

---

## 2. Требования

### Функциональные

- **R1.** Пользователь должен иметь возможность явно указать путь к конфигу при регистрации
  MCP-сервера — через аргумент командной строки или переменную окружения.
- **R2.** Явное указание пути должно иметь наивысший приоритет и не зависеть от CWD.
- **R3.** Обратная совместимость: существующие конфигурации (шаг 2 и 3 в порядке поиска)
  продолжают работать без изменений.
- **R4.** При передаче несуществующего явного пути сервер должен завершаться с понятной ошибкой,
  а не молча падать с ошибкой валидации.

### Нефункциональные

- Минимальные изменения: затрагиваются только `mcp-entry.ts` и `src/config/loader.ts`.
- Не добавлять новых зависимостей.

---

## 3. Предлагаемое решение

### 3.1. Флаг `--config <path>` в `mcp-entry.ts`

`mcp-entry.ts` парсит `process.argv` и при наличии флага `--config` передаёт путь в `loadConfig`.

```typescript
// Парсинг аргумента --config из process.argv.
function parseConfigArg(): string | undefined {
  const idx = process.argv.indexOf('--config');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  const configPath = parseConfigArg();
  const config = await loadConfig(configPath);
  // ...
}
```

### 3.2. Переменная окружения `RAG_CONFIG` в `loader.ts`

Добавить новый шаг 1 в `resolveConfigPath` — проверка `process.env.RAG_CONFIG` — до поиска в CWD.

```typescript
// Шаг 1: переменная окружения RAG_CONFIG.
const envConfigPath = process.env['RAG_CONFIG'];
if (envConfigPath) {
  const resolved = resolve(envConfigPath);
  if (await fileExists(resolved)) {
    return resolved;
  }
  // Файл не найден по пути из RAG_CONFIG — ошибка, а не тихий fallback.
  throw new Error(`Config file not found at RAG_CONFIG path: ${resolved}`);
}
```

### 3.3. Улучшение сообщения об ошибке

При передаче явного пути (`--config` или `RAG_CONFIG`) и отсутствии файла — выбрасывать ошибку
с понятным сообщением вместо тихого падения в дефолтный конфиг.

---

## 4. Новый порядок поиска конфига

| Приоритет | Источник | Метод задания |
|-----------|----------|---------------|
| 0 | `--config <path>` аргумент CLI | `args` в MCP-конфиге |
| 1 | `RAG_CONFIG` переменная окружения | `env` в MCP-конфиге |
| 2 | `./rag.config.yaml` (CWD) | Для разработки / CLI-режима |
| 3 | `~/.config/rag/config.yaml` | Глобальный пользовательский конфиг |

Если конфиг не найден ни по одному пути — используются дефолты (текущее поведение).

---

## 5. Примеры конфигурации после изменения

### Вариант A: через `--config` аргумент (рекомендуемый)

```json
{
  "mcpServers": {
    "local-rag": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/Users/user/Work/local-rag/dist/mcp-entry.js",
        "--config",
        "/Users/user/Work/local-rag/rag.config.yaml"
      ],
      "env": {
        "JINA_API_KEY": "jina_..."
      }
    }
  }
}
```

### Вариант B: через `RAG_CONFIG` переменную окружения

```json
{
  "mcpServers": {
    "local-rag": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/user/Work/local-rag/dist/mcp-entry.js"],
      "env": {
        "JINA_API_KEY": "jina_...",
        "RAG_CONFIG": "/Users/user/Work/local-rag/rag.config.yaml"
      }
    }
  }
}
```

### Вариант C: глобальный конфиг (текущий обходной путь, без изменений)

```bash
mkdir -p ~/.config/rag
cp /path/to/local-rag/rag.config.yaml ~/.config/rag/config.yaml
```

---

## 6. Затронутые файлы

| Файл | Тип изменения |
|------|---------------|
| `src/mcp-entry.ts` | Добавить парсинг `--config` из `process.argv` |
| `src/config/loader.ts` | Добавить шаг `RAG_CONFIG` env var в `resolveConfigPath` |
| `src/config/__tests__/loader.test.ts` | Добавить тесты для нового шага |

---

## 7. Тесты

### loader.test.ts

- `RAG_CONFIG` указывает на существующий файл → файл загружается.
- `RAG_CONFIG` указывает на несуществующий файл → выбрасывается ошибка с понятным сообщением.
- `RAG_CONFIG` не задан → поиск продолжается по следующим путям (CWD, global).
- `RAG_CONFIG` имеет приоритет над `./rag.config.yaml` в CWD.

### mcp-entry — интеграционный тест (опционально)

- `--config /valid/path` → сервер стартует с конфигом из файла.
- `--config /missing/path` → сервер завершается с кодом 1 и сообщением об ошибке.

---

## 8. Что НЕ входит в scope

- Парсинг других CLI-аргументов в `mcp-entry.ts` (не нужен полноценный `commander`).
- Поиск конфига относительно пути скрипта (`__dirname` / `import.meta.url`) — непредсказуемо
  при разных способах установки.
- Авто-обнаружение конфига через `find-up` (хождение по директориям вверх) — избыточно для
  персонального инструмента, путает с проектными конфигами.
