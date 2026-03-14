// Конфигурация retry для HTTP-запросов.
export interface RetryOptions {
  // Максимальное количество повторных попыток (по умолчанию 3).
  maxRetries?: number;
  // Базовая задержка для экспоненциального backoff при 5xx (мс, по умолчанию 1000).
  baseDelayMs?: number;
  // Фиксированная задержка при 429 (мс, по умолчанию = baseDelayMs, умножается на attempt).
  rateLimitDelayMs?: number;
  // HTTP timeout через AbortSignal (мс). Если не задан — без таймаута.
  timeoutMs?: number;
  // Префикс для сообщений об ошибках (по умолчанию 'HTTP').
  errorPrefix?: string;
  // Колбэк при каждом retry (для логирования).
  onRetry?: (attempt: number, maxRetries: number, delayMs: number, status: number) => void;
}

// Промис с задержкой для retry. Совместим с vi.useFakeTimers().
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Определяет, нужен ли retry по статус-коду ответа.
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

// Вычисляет задержку перед retry.
function computeDelay(
  attempt: number,
  status: number,
  baseDelayMs: number,
  rateLimitDelayMs: number,
): number {
  if (status === 429) {
    return rateLimitDelayMs * attempt;
  }
  return baseDelayMs * Math.pow(2, attempt - 1);
}

// HTTP fetch с retry, exponential backoff и AbortSignal.timeout.
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    rateLimitDelayMs = baseDelayMs,
    timeoutMs,
    errorPrefix = 'HTTP',
    onRetry,
  } = options;

  let lastStatus = 0;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = computeDelay(attempt, lastStatus, baseDelayMs, rateLimitDelayMs);
      onRetry?.(attempt, maxRetries, delayMs, lastStatus);
      await delay(delayMs);
    }

    // AbortSignal.timeout для ограничения времени запроса (если задан).
    const fetchInit = timeoutMs != null
      ? { ...init, signal: AbortSignal.timeout(timeoutMs) }
      : init;
    const response = await fetch(url, fetchInit);

    if (isRetryable(response.status)) {
      lastStatus = response.status;
      lastError = new Error(
        `${errorPrefix} error: ${response.status} ${response.statusText}`,
      );
      if (attempt < maxRetries) {
        continue;
      }
      throw lastError;
    }

    return response;
  }

  throw lastError ?? new Error(`${errorPrefix}: unexpected retry exhaustion`);
}
