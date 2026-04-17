// Команда rag summarize — backfill LLM-summary для chunk_contents.
// Opt-in per source (sources[].summarize: true).
// --dry-run обязательно печатает cost estimate и не шлёт запросы к провайдеру.
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import {
  createDb,
  closeDb,
  SourceStorage,
  ChunkContentStorage,
} from '../storage/index.js';
import { createTextEmbedder } from '../embeddings/index.js';
import { createSummarizer, shouldSummarize } from '../summarize/index.js';
import type { SummarizerInput } from '../summarize/index.js';
import { processSummarizeBatch } from './_helpers/summarize-batch.js';

// Размер пачки выборки chunk_contents из БД.
const FETCH_BATCH_SIZE = 50;

// Средняя длина контента в токенах (грубая оценка, согласована с планом T07).
const AVG_TOKENS_PER_CHUNK = 200;

// Цена за токен Qwen2.5-7B на SiliconFlow ($0.05 / 1M токенов).
const PRICE_PER_TOKEN = 0.05 / 1_000_000;

interface SummarizeCandidate {
  content_hash: string;
  content: string;
  path: string;
  source_type: string;
  language: string | null;
  metadata: Record<string, unknown>;
}

// Простая эвристика: определяет наличие JSDoc/JavaDoc/Kotlin-doc в начале содержимого.
function detectDocstring(content: string): boolean {
  const head = content.slice(0, 256);
  return head.includes('/**') || head.includes('/*!') || head.includes('"""');
}

// Собирает SummarizerInput из строки БД.
function toSummarizerInput(row: SummarizeCandidate): SummarizerInput {
  const meta = row.metadata;
  const fqn = typeof meta.fqn === 'string' ? meta.fqn : undefined;
  const fragmentType = typeof meta.fragmentType === 'string'
    ? meta.fragmentType
    : row.source_type;

  return {
    path: row.path,
    kind: fragmentType,
    fqn,
    language: row.language ?? undefined,
    hasDocstring: detectDocstring(row.content),
    content: row.content,
  };
}

// Человеческий формат цены.
function formatCost(cost: number): string {
  if (cost < 0.01) return `$${(cost * 1000).toFixed(2)}m`; // миллидоллары
  return `$${cost.toFixed(3)}`;
}

export const summarizeCommand = new Command('summarize')
  .description('Backfill LLM summaries for chunk_contents (opt-in per source)')
  .option('--source <name>', 'Filter to specific source (required)')
  .option('--limit <n>', 'Process at most N chunk_contents per run', (v) => parseInt(v, 10))
  .option('--dry-run', 'Print cost estimate and plan without sending LLM requests')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options: {
    source?: string;
    limit?: number;
    dryRun?: boolean;
    config?: string;
  }) => {
    try {
      if (!options.source) {
        console.error('Ошибка: параметр --source <name> обязателен.');
        process.exit(1);
      }

      const appConfig = await loadConfig(options.config);
      const sourceConfig = appConfig.sources.find((s) => s.name === options.source);
      if (!sourceConfig) {
        console.error(`Источник "${options.source}" не найден в rag.config.yaml.`);
        process.exit(1);
      }
      if (!sourceConfig.summarize) {
        console.error(
          `Источник "${options.source}" не включён для summarization. ` +
          'Добавьте в rag.config.yaml: sources[…].summarize: true',
        );
        process.exit(1);
      }

      const sql = createDb(appConfig.database);

      try {
        const sourceStorage = new SourceStorage(sql);
        const chunkContentStorage = new ChunkContentStorage(sql);

        const source = await sourceStorage.getByName(options.source);
        if (!source) {
          console.error(
            `Источник "${options.source}" отсутствует в БД. ` +
            `Сначала выполните rag index --source ${options.source}.`,
          );
          process.exit(1);
        }

        // Подсчёт кандидатов.
        const totalCandidates = await chunkContentStorage
          .countWithNullSummaryForSource(source.id);

        console.log(`Источник: ${options.source} (id=${source.id})`);
        console.log(`Кандидатов с NULL summary (source_type=code): ${totalCandidates}`);

        if (totalCandidates === 0) {
          console.log('Нет чанков для суммаризации. Выход.');
          return;
        }

        // Dry-run: оцениваем стоимость и пропуск через gates (на случайной выборке до 500).
        if (options.dryRun) {
          const sampleSize = Math.min(500, totalCandidates);
          const sample = await chunkContentStorage.getWithNullSummaryForSource(
            source.id,
            sampleSize,
          );

          let skipped = 0;
          for (const row of sample) {
            const input = toSummarizerInput(row as SummarizeCandidate);
            if (shouldSummarize(input).skip) skipped++;
          }

          const skipRate = sample.length === 0 ? 0 : skipped / sample.length;
          const expectedSummarize = Math.round(totalCandidates * (1 - skipRate));
          const estimatedTokens = expectedSummarize * AVG_TOKENS_PER_CHUNK;
          const estimatedCost = estimatedTokens * PRICE_PER_TOKEN;

          console.log('--- Dry-run оценка ---');
          console.log(`Выборка для skip-rate: ${sample.length} чанков`);
          console.log(`Skip-rate (Gate 1+2): ${(skipRate * 100).toFixed(1)}%`);
          console.log(`Ожидаемое число LLM-вызовов: ${expectedSummarize}`);
          console.log(`Ожидаемое число токенов: ${estimatedTokens.toLocaleString()}`);
          console.log(`Оценка стоимости (Qwen2.5-7B): ${formatCost(estimatedCost)}`);
          console.log('Референс KariPos (~18K чанков): $0.30–$0.70');
          console.log('Запросы к провайдеру НЕ отправлялись.');
          return;
        }

        // Реальный прогон.
        const summarizer = createSummarizer(appConfig);
        const embedder = createTextEmbedder(appConfig.embeddings);

        const maxToProcess = options.limit ?? totalCandidates;
        const concurrency = appConfig.summarization.concurrency;

        let processed = 0;
        let summarized = 0;
        let skippedCount = 0;
        let failedCount = 0;

        // Обработка батчами keyset-pagination.
        while (processed < maxToProcess) {
          const remaining = maxToProcess - processed;
          const batchSize = Math.min(FETCH_BATCH_SIZE, remaining);

          const rows = await chunkContentStorage.getWithNullSummaryForSource(
            source.id,
            batchSize,
          );

          if (rows.length === 0) {
            break;
          }

          const candidates = rows.map((row) => ({
            contentHash: row.content_hash,
            input: toSummarizerInput(row as SummarizeCandidate),
          }));

          const batchResult = await processSummarizeBatch({
            candidates,
            summarizer,
            embedder,
            storage: chunkContentStorage,
            concurrency,
          });

          summarized += batchResult.summarized;
          skippedCount += batchResult.skipped;
          failedCount += batchResult.failed;

          processed += rows.length;
          console.log(
            `Обработано ${processed}/${maxToProcess}: ` +
            `ok=${summarized}, skipped=${skippedCount}, failed=${failedCount}`,
          );
        }

        console.log(
          `\nЗавершено. Обработано=${processed}, summarized=${summarized}, ` +
          `skipped=${skippedCount}, failed=${failedCount}`,
        );
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Ошибка команды rag summarize${options.source ? ` для источника "${options.source}"` : ''}: ${message}`,
      );
      process.exit(1);
    }
  });
