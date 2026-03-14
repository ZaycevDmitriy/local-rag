import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '../retry.js';

// Мок-ответ для тестов.
function mockResponse(status: number, statusText: string, ok?: boolean): Partial<Response> {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    statusText,
  };
}

describe('fetchWithRetry', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('возвращает ответ при успешном запросе', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, 'OK'));

    const response = await fetchWithRetry('https://api.test/v1', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('возвращает не-ok ответ без retry (4xx кроме 429)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(400, 'Bad Request'));

    const response = await fetchWithRetry('https://api.test/v1', { method: 'POST' });

    expect(response.status).toBe(400);
    expect(response.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('передаёт url и init в fetch', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, 'OK'));

    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"test":1}',
    };
    await fetchWithRetry('https://api.test/v1', init);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/v1');
    expect(options.method).toBe('POST');
    expect(options.body).toBe('{"test":1}');
  });

  it('использует errorPrefix в сообщении об ошибке', async () => {
    fetchMock.mockResolvedValue(mockResponse(500, 'Internal Server Error'));

    await expect(
      fetchWithRetry('https://api.test/v1', { method: 'POST' }, {
        maxRetries: 0,
        errorPrefix: 'My API',
      }),
    ).rejects.toThrow('My API error: 500 Internal Server Error');
  });

  describe('retry логика', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('повторяет запрос при 429', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(429, 'Too Many Requests'))
        .mockResolvedValueOnce(mockResponse(200, 'OK'));

      const promise = fetchWithRetry('https://api.test/v1', { method: 'POST' });

      // Дефолт baseDelayMs = 1000, для 429 delay = baseDelayMs * 1 = 1000.
      await vi.advanceTimersByTimeAsync(1000);

      const response = await promise;
      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('повторяет запрос при 5xx', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(500, 'Internal Server Error'))
        .mockResolvedValueOnce(mockResponse(200, 'OK'));

      const promise = fetchWithRetry('https://api.test/v1', { method: 'POST' });

      await vi.advanceTimersByTimeAsync(1000);

      const response = await promise;
      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('использует экспоненциальный backoff для 5xx', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(500, 'Error'))
        .mockResolvedValueOnce(mockResponse(500, 'Error'))
        .mockResolvedValueOnce(mockResponse(200, 'OK'));

      const promise = fetchWithRetry('https://api.test/v1', { method: 'POST' });

      // attempt 1: 1000 * 2^0 = 1000.
      await vi.advanceTimersByTimeAsync(1000);
      // attempt 2: 1000 * 2^1 = 2000.
      await vi.advanceTimersByTimeAsync(2000);

      const response = await promise;
      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('использует rateLimitDelayMs для 429', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(429, 'Too Many Requests'))
        .mockResolvedValueOnce(mockResponse(200, 'OK'));

      const promise = fetchWithRetry(
        'https://api.test/v1',
        { method: 'POST' },
        { rateLimitDelayMs: 60_000 },
      );

      // attempt 1: 60_000 * 1 = 60s.
      await vi.advanceTimersByTimeAsync(60_000);

      const response = await promise;
      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('выбрасывает ошибку после исчерпания retry', async () => {
      fetchMock.mockResolvedValue(mockResponse(500, 'Internal Server Error'));

      let caughtError: Error | undefined;
      const promise = fetchWithRetry(
        'https://api.test/v1',
        { method: 'POST' },
        { maxRetries: 2 },
      ).catch((err: Error) => {
        caughtError = err;
      });

      // attempt 1: 1000ms.
      await vi.advanceTimersByTimeAsync(1000);
      // attempt 2: 2000ms.
      await vi.advanceTimersByTimeAsync(2000);

      await promise;

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toBe('HTTP error: 500 Internal Server Error');
      // 1 начальная + 2 retry = 3 вызова.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('вызывает onRetry при каждом retry', async () => {
      fetchMock
        .mockResolvedValueOnce(mockResponse(503, 'Service Unavailable'))
        .mockResolvedValueOnce(mockResponse(200, 'OK'));

      const onRetry = vi.fn();
      const promise = fetchWithRetry(
        'https://api.test/v1',
        { method: 'POST' },
        { onRetry },
      );

      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      expect(onRetry).toHaveBeenCalledOnce();
      expect(onRetry).toHaveBeenCalledWith(1, 3, 1000, 503);
    });
  });

  it('добавляет AbortSignal.timeout при timeoutMs', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, 'OK'));

    await fetchWithRetry(
      'https://api.test/v1',
      { method: 'POST' },
      { timeoutMs: 5000 },
    );

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeDefined();
  });

  it('не добавляет signal без timeoutMs', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, 'OK'));

    await fetchWithRetry('https://api.test/v1', { method: 'POST' });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeUndefined();
  });
});
