[← CLI-команды](cli.md) · [Back to README](../README.md) · [MCP-интеграция →](mcp-integration.md)

# Конфигурация

## rag.config.yaml

```yaml
database:
  host: localhost
  port: 5432
  name: local_rag
  user: rag
  password: rag

embeddings:
  provider: jina                    # jina | openai | siliconflow
  jina:
    apiKey: ${JINA_API_KEY}         # Подстановка переменных окружения
    model: jina-embeddings-v3
    dimensions: 1024

reranker:
  provider: none                    # jina | siliconflow | none
  jina:
    apiKey: ${JINA_API_KEY}
    model: jina-reranker-v2-base-multilingual

search:
  bm25Weight: 0.4                   # Вес BM25 в RRF
  vectorWeight: 0.6                 # Вес векторного поиска
  summaryVectorWeight: 0.0          # Вес vec-summary (только при useSummaryVector)
  retrieveTopK: 50                  # Сколько результатов брать из каждого канала
  finalTopK: 10                     # Финальное количество результатов
  rrf:
    k: 60                           # Параметр RRF fusion
  useSummaryVector: false           # Включить 3-way поиск (BM25 + vec-content + vec-summary)

# LLM-генерация описаний чанков (AI-powered summarization). Запускается командой `rag summarize`.
summarization:
  provider: siliconflow             # siliconflow | mock
  model: Qwen/Qwen2.5-7B-Instruct
  apiKey: ${SILICONFLOW_API_KEY}    # опционально, дефолтом тот же ключ, что у embeddings
  concurrency: 4                    # Параллельность вызовов LLM
  timeoutMs: 60000                  # HTTP timeout per request
  cost:
    dryRunRequired: true            # Требовать `rag summarize --dry-run` до первого прогона

sources:
  - name: my-project
    type: local
    path: /path/to/project
    summarize: true                 # Opt-in: разрешить `rag summarize` для этого источника
    include: ['**/*.ts', '**/*.md']
    exclude: ['**/node_modules/**', '**/dist/**']

  - name: some-lib
    type: git
    url: https://github.com/user/some-lib
    branch: main
    include: ['src/**/*.ts']

indexing:
  chunkSize:
    maxTokens: 1000                 # Макс. размер чанка в токенах
    overlap: 100                    # Перекрытие между чанками
  git:
    cloneDir: ~/.local/share/rag/repos  # Куда клонировать Git-репозитории
  strictAst: false                  # Падать с ошибкой, если tree-sitter грамматика недоступна
```

## Путь к конфигу

Конфиг ищется в следующем порядке:

| Приоритет | Источник | При отсутствии файла |
|-----------|----------|---------------------|
| 0 | `--config <path>` (CLI / MCP-сервер) | ошибка с указанием пути |
| 1 | `RAG_CONFIG=<path>` (переменная окружения) | ошибка с указанием пути |
| 2 | `./rag.config.yaml` (текущая директория) | продолжить поиск |
| 3 | `~/.config/rag/config.yaml` | продолжить поиск |
| — | Ничего не найдено | дефолтные значения |

`RAG_CONFIG` удобен при запуске MCP-сервера как глобального инструмента, когда рабочая директория принадлежит другому проекту:

```json
{
  "mcpServers": {
    "local-rag": {
      "command": "node",
      "args": ["/absolute/path/to/local-rag/dist/mcp-entry.js"],
      "env": {
        "RAG_CONFIG": "/absolute/path/to/local-rag/rag.config.yaml",
        "JINA_API_KEY": "your_key"
      }
    }
  }
}
```

## Переменные окружения

В `apiKey` поддерживается синтаксис `${ENV_VAR}` — значение берётся из переменной окружения.

## Провайдеры эмбеддингов

| Провайдер | Модель по умолчанию | Размерность | Нужен ключ |
|-----------|---------------------|-------------|------------|
| `jina` | `jina-embeddings-v3` | 1024 | `JINA_API_KEY` |
| `openai` | `text-embedding-3-small` | 1536 | `OPENAI_API_KEY` |
| `siliconflow` | `Qwen/Qwen3-Embedding-0.6B` | 1024 | `SILICONFLOW_API_KEY` |

## Провайдеры реранкера

| Провайдер | Модель по умолчанию | Нужен ключ |
|-----------|---------------------|------------|
| `jina` | `jina-reranker-v2-base-multilingual` | `JINA_API_KEY` |
| `siliconflow` | `Qwen/Qwen3-Reranker-0.6B` | `SILICONFLOW_API_KEY` |
| `none` | — | нет |

## Strict AST

`indexing.strictAst` управляет поведением при отсутствии optional tree-sitter грамматик:

- `false` — используется graceful degradation, файл обрабатывается fallback chunker
- `true` — индексация завершается ошибкой, если нужная грамматика не установлена

## Фильтрация файлов

При индексации файлы фильтруются в таком порядке:

1. `.gitignore` — если директория является Git-репозиторием
2. `.ragignore` — аналогичный формат, специфичный для RAG
3. `include` / `exclude` из конфигурации источника
4. Бинарные файлы пропускаются автоматически

Пример `.ragignore`:

```
# Исключить тестовые файлы.
**/__tests__/**
**/*.test.ts

# Исключить сгенерированное.
dist/
*.min.js
```

## See Also

- [CLI-команды](cli.md) — полная справка по командам
- [MCP-интеграция](mcp-integration.md) — подключение к AI-агентам
