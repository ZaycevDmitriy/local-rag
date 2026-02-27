# Фаза 8: Config Path Resolution

Цель: позволить MCP-серверу находить `rag.config.yaml` при запуске из произвольной CWD. Два механизма: аргумент `--config <path>` и переменная окружения `RAG_CONFIG`.

**Предусловие:** фазы 1-4 завершены. MCP-сервер работает при запуске из директории с `rag.config.yaml`.

**Критерий завершения:** `npm run build && npm run lint && npm test` — зелёные. MCP-сервер стартует с `--config /path/to/rag.config.yaml` из любой CWD.

**Спецификация:** `docs/specs/config-path-resolution.md`

---

## Шаг 8.1 — `RAG_CONFIG` env var в loader.ts

### Задача

Добавить проверку переменной окружения `RAG_CONFIG` в `resolveConfigPath`. Приоритет: `configPath` (аргумент) > `RAG_CONFIG` (env) > CWD > global.

### Файлы

| Файл | Действие |
|------|----------|
| `src/config/loader.ts` | Добавить шаг `RAG_CONFIG` в `resolveConfigPath` |

### Изменения в resolveConfigPath

Между проверкой `configPath` и поиском в CWD — добавить:

```typescript
// Шаг 2: переменная окружения RAG_CONFIG.
const envConfigPath = process.env['RAG_CONFIG'];
if (envConfigPath) {
  const resolved = resolve(envConfigPath);
  if (await fileExists(resolved)) {
    return resolved;
  }
  // Файл не найден по явному пути — ошибка, а не тихий fallback.
  throw new Error(`Config file not found at RAG_CONFIG path: ${resolved}`);
}
```

### Порядок поиска после изменения

| Приоритет | Источник | Метод задания |
|-----------|----------|---------------|
| 0 | `--config <path>` аргумент CLI | `args` в MCP-конфиге |
| 1 | `RAG_CONFIG` переменная окружения | `env` в MCP-конфиге |
| 2 | `./rag.config.yaml` (CWD) | Для разработки / CLI-режима |
| 3 | `~/.config/rag/config.yaml` | Глобальный пользовательский конфиг |

---

## Шаг 8.2 — `--config` аргумент в mcp-entry.ts

### Задача

Добавить парсинг `--config` из `process.argv` в `mcp-entry.ts` и передать путь в `loadConfig()`.

### Файлы

| Файл | Действие |
|------|----------|
| `src/mcp-entry.ts` | Добавить `parseConfigArg()`, передать в `loadConfig()` |

### Изменения

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

---

## Шаг 8.3 — Тесты

### Задача

Добавить тесты для `RAG_CONFIG` в `src/config/__tests__/loader.test.ts`.

### Файлы

| Файл | Действие |
|------|----------|
| `src/config/__tests__/loader.test.ts` | Добавить describe-блок для `RAG_CONFIG` |

### Тесты

- `RAG_CONFIG` → существующий файл → загружается.
- `RAG_CONFIG` → несуществующий файл → throw с понятным сообщением.
- `RAG_CONFIG` не задан → fallback к CWD/global (текущее поведение).
- `RAG_CONFIG` приоритетнее `./rag.config.yaml` в CWD.

---

## Примеры конфигурации MCP-клиента

### Вариант A: через `--config` (рекомендуемый)

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

### Вариант B: через `RAG_CONFIG`

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

---

## Чеклист завершения фазы 8

- [ ] `RAG_CONFIG` env var обрабатывается в `resolveConfigPath`
- [ ] `--config` аргумент парсится в `mcp-entry.ts`
- [ ] Явный путь + отсутствие файла → throw с понятным сообщением
- [ ] Тесты для всех сценариев `RAG_CONFIG`
- [ ] `npm run build` — OK
- [ ] `npm run lint` — OK
- [ ] `npm test` — все тесты проходят
