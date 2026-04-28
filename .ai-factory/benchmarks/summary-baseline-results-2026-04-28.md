# Summary baseline results — 2026-04-28

Source: `karipos`

## Pre-flight coverage

Embedding coverage:

- Indexed files: `44172`
- Chunks: `129756`
- Chunks with embedding: `129756`
- Coverage: `100.00%`
- Gate: pass (`>= 95%`)

Summary coverage over distinct `chunk_contents.content_hash` joined to `karipos`:

- Total: `15518`
- With summary: `15389`
- With summary embedding: `9988`
- Failed sentinel summaries: `55`
- Skipped sentinel summaries: `5346`
- Raw summary embedding coverage: `64.4%`
- Eligible summary embedding coverage, excluding skipped and failed rows: `98.7%`

Interpretation: raw `summary_embedding / total` is below the nominal `90%` gate because skip-gates intentionally write `[skipped:*]` summaries without embeddings. There were no remaining `NULL` summary candidates for `source_type=code` after the resumed backfill. For this run, treatment quality is interpreted with the eligible coverage number.

## Canonical JSON run

Artifact: `bench-result-2026-04-28.json`

| Mode | Queries | Recall@5 | Recall@10 | MRR |
| --- | ---: | ---: | ---: | ---: |
| baseline | 20 | 65.0% | 80.0% | 0.540 |
| treatment | 20 | 65.0% | 80.0% | 0.539 |
| delta | - | +0.0 pp | +0.0 pp | -0.001 |

Per-category Recall@5:

| Category | baseline | treatment |
| --- | ---: | ---: |
| auth | 75.0% | 75.0% |
| payment | 75.0% | 75.0% |
| order_sync | 75.0% | 75.0% |
| receipt_printing | 50.0% | 50.0% |
| navigation_ui | 50.0% | 50.0% |

## Repeat runs

Artifacts:

- `bench-result-2026-04-28.txt`
- `bench-result-2026-04-28-index-audit.txt`

Recall@5 and Recall@10 stayed stable at `65.0%` / `80.0%` for both baseline and treatment across repeat runs. MRR varied slightly between runs, consistent with provider/reranker nondeterminism, but did not change the acceptance signal.

## Author interpretation

The v2 golden set is now usable as a regression guard: both baseline and treatment have non-zero Recall@5, and treatment does not regress Recall@5 or Recall@10. In this dataset the summary vector lane is neutral rather than positive. The largest remaining weakness is not summarization coverage; it is query/category relevance for `receipt_printing` and `navigation_ui`, where both modes stay at `50%` Recall@5.

