# Spec: AI-powered summarization

[← specs](.) · [Back to README](../../README.md)

Фича добавляет LLM-генерацию English-summary для чанков и 3-way hybrid search (BM25 + vec-content + vec-summary) через единый embedder.

## Mотивация

Естественно-языковые запросы («how session refresh works», «payment flow») плохо матчатся с кодом на content-vec, потому что комментарии в репозитории могут быть на другом языке (например, русском) или отсутствовать. Summary — нормализованный English-описание функционала чанка — даёт дополнительный вектор, на который такие запросы попадают значительно лучше.

Precision на FQN-запросах остаётся за BM25 + content-vec.

## Архитектура

```
Query
  ├─ BM25 (chunk_contents.search_vector, GIN)
  ├─ vec-content (chunk_contents.embedding, HNSW)
  └─ vec-summary (chunk_contents.summary_embedding, partial HNSW)
                     │
                     └─ RRF (3-way fusion, weighted)
                           │
                           └─ Rerank → final topK
```

- `summary` и `summary_embedding` живут в `chunk_contents` — дедуплицируются per `content_hash` (одна summary на уникальный текст чанка).
- Размерность `summary_embedding` совпадает с `embedding` (один `TextEmbedder`, один `query_vector`).
- `useSummaryVector: false` → graceful fallback на 2-way; флаг на уровне `search`, не per-query.

## Миграция 006

Файл `src/storage/migrations/006_summarization.ts`. Factory-migration, принимает vector dimensions (совпадает с 005).

### Up (applied автоматически `rag init`)

```sql
ALTER TABLE chunk_contents ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE chunk_contents ADD COLUMN IF NOT EXISTS summary_embedding vector(N);

CREATE INDEX IF NOT EXISTS idx_chunk_contents_summary_embedding
  ON chunk_contents USING hnsw (summary_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200)
  WHERE summary_embedding IS NOT NULL;
```

- **Non-destructive** — ALTER TABLE + IF NOT EXISTS, безопасна на проде.
- **Partial HNSW** — обязательная форма: без `WHERE` пустая таблица с NULL-векторами ломает hnsw-индекс.

### Rollback (manual)

Миграции системы up-only; для отката выполнить руками на копии БД:

```sql
DROP INDEX IF EXISTS idx_chunk_contents_summary_embedding;
ALTER TABLE chunk_contents DROP COLUMN IF EXISTS summary_embedding;
ALTER TABLE chunk_contents DROP COLUMN IF EXISTS summary;

-- Удалить запись о применении, чтобы следующий rag init мог снова применить 006.
DELETE FROM _migrations WHERE name = '006_summarization';
```

Pre-merge smoke test: `rag init` на копии prod-БД → rollback → `rag init` повторно. Оба прогона должны завершаться чисто.

## Prompt

System (cache-friendly, один на прогон):

> You summarize source-code and documentation fragments for semantic search. Write 60-120 words in English regardless of the language in comments or identifiers. Describe WHAT the fragment does and its role in a codebase so that developer-style natural-language queries (e.g. "how session refresh works", "payment flow") can match it. Never invent APIs, parameters, return types, or behaviour that is not explicitly present. Do not quote the code verbatim. Output a single paragraph, no headings, no bullet lists.

User (строгий формат, per-chunk):

```
Path: <path>
Kind: <kind>
FQN: <fqn>          (опционально)
Language: <lang>    (опционально)
---
<content>
```

Параметры генерации фиксированы: `temperature=0.2`, `max_tokens=300`.

## Skip-gates

1. `content.length < 200` → `skip`.
2. `kind ∈ {TYPE, INTERFACE}` **без docstring** → `skip`.
   - Docstring определяется наличием маркеров `/**`, `/*!` или `"""` в теле чанка.
   - Если docstring **есть** — тип/интерфейс суммаризируется по docstring + телу (gate не срабатывает).
   - Если docstring **нет** — тело такого чанка в TS/JS/Java обычно состоит из одних сигнатур полей, и LLM нечего обобщить поверх имени.

Для skipped чанков в `summary` пишется placeholder `[skipped:<reason>]`, чтобы повторный прогон команды не выбирал их снова. `summary_embedding` остаётся NULL — такие чанки не участвуют в 3-way.

## CLI: `rag summarize`

```
rag summarize --source <name> [--limit N] [--dry-run] [--config PATH]
```

- Source должен быть включён (`sources[].summarize: true`) и проиндексирован.
- `--dry-run` печатает оценку стоимости по выборке 500 чанков и завершает процесс, **не отправляя запросов к провайдеру**.
- Идемпотентна: обрабатывает только `summary IS NULL`.
- Прогресс-лог: `Обработано N/M: ok=..., skipped=..., failed=...`.

Cost estimate для KariPos (~18K чанков, skip ~30%, Qwen2.5-7B): $0.30–$0.70.

## Конфигурация

```yaml
summarization:
  provider: siliconflow            # siliconflow | mock
  model: Qwen/Qwen2.5-7B-Instruct
  apiKey: ${SILICONFLOW_API_KEY}   # fallback — embeddings.siliconflow.apiKey
  concurrency: 4
  timeoutMs: 60000
  cost:
    dryRunRequired: true

search:
  bm25Weight: 0.2
  vectorWeight: 0.5
  summaryVectorWeight: 0.3
  useSummaryVector: true           # включает 3-way
sources:
  - name: karipos
    type: local
    path: /path/to/karipos
    summarize: true                # opt-in per source
```

Zod `.refine()`: при `useSummaryVector: true` сумма `bm25Weight + vectorWeight + summaryVectorWeight` должна быть `1.0 ± 0.01`.

## Benchmark

Golden set: `.ai-factory/benchmarks/summary-baseline.json` (9 seed queries; расширяется до 30 через LLM-сессию).
Runner: `scripts/bench-summary.ts` (`--mode baseline|treatment|both`, `--json`).
Pre-requisite: `scripts/validate-coverage.ts --source karipos --min 95`.

Метрики: Recall@5, Recall@10, MRR + per-category breakdown.
Fairness: одна БД, один embedder, один reranker, единственное различие — флаг `useSummaryVector`.
Merge criterion: Recall@5 treatment ≥ baseline на hard cases + субъективная top-5 оценка на concept-запросах.

## Risks

| Риск | Митигация |
|------|-----------|
| HNSW на пустой таблице с NULL-векторами | Partial HNSW `WHERE summary_embedding IS NOT NULL` |
| Cost spike при backfill | `rag summarize --dry-run` обязателен перед первым прогоном, `--limit` для инкрементальных батчей |
| Rate limits SiliconFlow | `summarization.concurrency` (дефолт 4) + retry на 429 в `fetchWithRetry` |
| KariPos coverage низкий | `validate-coverage.ts` блокирует benchmark при coverage < 95% |
| Симметрия query/passage | Summary на English, embedder тот же — русский запрос всё ещё ловится content-vec |
| Weights normalization | Zod `.refine` с допуском ±0.01 и user-friendly сообщением |
| Migration 006 rollback | Rollback SQL задокументирован выше; система миграций up-only |

## Out of scope (v1)

- BM25 tsvector по summary (`search_vector_summary` + GIN) — v2 после benchmark.
- Автоматическая проверка hallucinations — v1.5.
- Context enrichment промта (header_path / enclosing / neighbours) — v2.
- `rag index --summarize` flag — v2.
- MCP-параметр `useSummary` per-query — сейчас через config.
