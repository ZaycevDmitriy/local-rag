// Helper: расчёт dry-run оценки для команды `rag summarize --dry-run`.
// Бизнес-логика вынесена из команды, чтобы cost/skip-rate агрегация
// была unit-testable без моков Commander.
import { shouldSummarize, type SummarizerInput } from '../../summarize/index.js';

// Структурированная оценка dry-run — достаточно для печати отчёта командой.
export interface DryRunEstimate {
  sampleSize: number;
  skippedInSample: number;
  skipRate: number;
  expectedSummarize: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
}

// Формат цены: миллидоллары при < $0.01, иначе 3 знака после точки.
export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${(cost * 1000).toFixed(2)}m`;
  return `$${cost.toFixed(3)}`;
}

// Считает ожидаемое число LLM-вызовов и стоимость по выборке кандидатов.
// Возвращает полную оценку — презентация остаётся за caller'ом.
export function estimateDryRun(args: {
  sample: SummarizerInput[];
  totalCandidates: number;
  avgTokensPerChunk: number;
  pricePerTokenUsd: number;
}): DryRunEstimate {
  const { sample, totalCandidates, avgTokensPerChunk, pricePerTokenUsd } = args;

  let skipped = 0;
  for (const input of sample) {
    if (shouldSummarize(input).skip) skipped++;
  }

  const sampleSize = sample.length;
  const skipRate = sampleSize === 0 ? 0 : skipped / sampleSize;
  const expectedSummarize = Math.round(totalCandidates * (1 - skipRate));
  const estimatedTokens = expectedSummarize * avgTokensPerChunk;
  const estimatedCostUsd = estimatedTokens * pricePerTokenUsd;

  return {
    sampleSize,
    skippedInSample: skipped,
    skipRate,
    expectedSummarize,
    estimatedTokens,
    estimatedCostUsd,
  };
}
