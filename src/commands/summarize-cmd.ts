// Команда rag summarize — backfill LLM-summary для chunk_contents.
// Opt-in per source (sources[].summarize: true).
// Адаптер: парсит опции, резолвит зависимости, делегирует прогон helper'ам.
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
import { createSummarizer } from '../summarize/index.js';
import { estimateDryRun, formatCost } from './_helpers/summarize-dry-run.js';
import { runSummarizeLoop } from './_helpers/summarize-run.js';
import { toSummarizerInput, type SummarizeCandidateRow } from './_helpers/summarize-input.js';

// Размер пачки выборки chunk_contents из БД.
const FETCH_BATCH_SIZE = 50;

// Максимум выборки для оценки dry-run skip-rate.
// SHA-256 распределён равномерно, поэтому первые 500 записей по лексикографическому
// порядку хэша — репрезентативная выборка, а не смещённая. Это осознанный выбор
// вместо `ORDER BY RANDOM()`: одинаковый dry-run между прогонами и в CI.
const DRY_RUN_SAMPLE_LIMIT = 500;

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

        const totalCandidates = await chunkContentStorage
          .countWithNullSummaryForSource(source.id);

        console.log(`Источник: ${options.source} (id=${source.id})`);
        console.log(`Кандидатов с NULL summary (source_type=code): ${totalCandidates}`);

        if (totalCandidates === 0) {
          console.log('Нет чанков для суммаризации. Выход.');
          return;
        }

        if (options.dryRun) {
          const sampleSize = Math.min(DRY_RUN_SAMPLE_LIMIT, totalCandidates);
          const rows = await chunkContentStorage.getWithNullSummaryForSource(
            source.id,
            sampleSize,
          );

          const sample = rows.map((row) => toSummarizerInput(row as SummarizeCandidateRow));
          const estimate = estimateDryRun({
            sample,
            totalCandidates,
            avgTokensPerChunk: appConfig.summarization.cost.avgTokensPerChunk,
            pricePerTokenUsd: appConfig.summarization.cost.pricePerTokenUsd,
          });

          console.log('--- Dry-run оценка ---');
          console.log(`Модель: ${appConfig.summarization.model}`);
          console.log(
            `Параметры стоимости: avgTokensPerChunk=${appConfig.summarization.cost.avgTokensPerChunk}, ` +
            `pricePerTokenUsd=${appConfig.summarization.cost.pricePerTokenUsd}`,
          );
          console.log(`Выборка для skip-rate: ${estimate.sampleSize} чанков`);
          console.log(`Skip-rate (Gate 1+2): ${(estimate.skipRate * 100).toFixed(1)}%`);
          console.log(`Ожидаемое число LLM-вызовов: ${estimate.expectedSummarize}`);
          console.log(`Ожидаемое число токенов: ${estimate.estimatedTokens.toLocaleString()}`);
          console.log(`Оценка стоимости: ${formatCost(estimate.estimatedCostUsd)}`);
          console.log('Референс KariPos (~18K чанков, Qwen2.5-7B): $0.30–$0.70');
          console.log('Запросы к провайдеру НЕ отправлялись.');
          return;
        }

        // Реальный прогон.
        const summarizer = createSummarizer(appConfig);
        const embedder = createTextEmbedder(appConfig.embeddings);

        const maxToProcess = options.limit ?? totalCandidates;
        const concurrency = appConfig.summarization.concurrency;

        const result = await runSummarizeLoop({
          sourceId: source.id,
          chunkContentStorage,
          summarizer,
          embedder,
          concurrency,
          maxToProcess,
          fetchBatchSize: FETCH_BATCH_SIZE,
          onProgress: (stats) => {
            console.log(
              `Обработано ${stats.processed}/${maxToProcess}: ` +
              `ok=${stats.summarized}, skipped=${stats.skipped}, failed=${stats.failed}`,
            );
          },
        });

        console.log(
          `\nЗавершено. Обработано=${result.processed}, summarized=${result.summarized}, ` +
          `skipped=${result.skipped}, failed=${result.failed}`,
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
