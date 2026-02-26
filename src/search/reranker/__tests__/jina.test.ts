import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JinaReranker } from '../jina.js';
import { NoopReranker } from '../noop.js';
import { createReranker } from '../factory.js';
import type { RerankDocument } from '../types.js';

// Тип ответа Jina Reranker API для тестов.
interface JinaRerankResponse {
  results: Array<{
    index: number;
    relevance_score: number;
    document: { text: string };
  }>;
}

// Тело запроса к Jina Reranker API для проверок.
interface JinaRerankRequestBody {
  model: string;
  query: string;
  documents: Array<{ text: string }>;
  top_n: number;
}

// Конфигурация по умолчанию для тестов.
const DEFAULT_CONFIG = {
  apiKey: 'test-api-key',
  model: 'jina-reranker-v2-base-multilingual',
};

// Создание мок-ответа Jina Reranker API.
function makeJinaRerankResponse(
  documents: RerankDocument[],
  scores: number[],
): JinaRerankResponse {
  return {
    results: documents.map((doc, i) => ({
      index: i,
      relevance_score: scores[i] ?? 0.5,
      document: { text: doc.content },
    })),
  };
}

describe('JinaReranker', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('возвращает пустой массив для пустых документов', async () => {
    const reranker = new JinaReranker(DEFAULT_CONFIG);
    const result = await reranker.rerank('query', [], 10);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('отправляет корректное тело запроса', async () => {
    const docs: RerankDocument[] = [
      { id: 'doc-1', content: 'first document' },
      { id: 'doc-2', content: 'second document' },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeJinaRerankResponse(docs, [0.9, 0.7]),
    });

    const reranker = new JinaReranker(DEFAULT_CONFIG);
    await reranker.rerank('test query', docs, 2);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.jina.ai/v1/rerank');
    expect(options.method).toBe('POST');

    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-api-key');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body as string) as JinaRerankRequestBody;
    expect(body.model).toBe('jina-reranker-v2-base-multilingual');
    expect(body.query).toBe('test query');
    expect(body.documents).toEqual([
      { text: 'first document' },
      { text: 'second document' },
    ]);
    expect(body.top_n).toBe(2);
  });

  it('маппит результаты обратно на id документов через index', async () => {
    const docs: RerankDocument[] = [
      { id: 'chunk-abc', content: 'first' },
      { id: 'chunk-def', content: 'second' },
      { id: 'chunk-ghi', content: 'third' },
    ];

    // API возвращает результаты в порядке убывания релевантности.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async (): Promise<JinaRerankResponse> => ({
        results: [
          { index: 2, relevance_score: 0.95, document: { text: 'third' } },
          { index: 0, relevance_score: 0.80, document: { text: 'first' } },
          { index: 1, relevance_score: 0.60, document: { text: 'second' } },
        ],
      }),
    });

    const reranker = new JinaReranker(DEFAULT_CONFIG);
    const results = await reranker.rerank('query', docs, 3);

    // Результаты в порядке реранкера с правильными id.
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ id: 'chunk-ghi', score: 0.95, index: 2 });
    expect(results[1]).toEqual({ id: 'chunk-abc', score: 0.80, index: 0 });
    expect(results[2]).toEqual({ id: 'chunk-def', score: 0.60, index: 1 });
  });

  it('выбрасывает ошибку при статусе 400', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const docs: RerankDocument[] = [{ id: 'doc-1', content: 'text' }];
    const reranker = new JinaReranker(DEFAULT_CONFIG);

    await expect(reranker.rerank('query', docs, 1)).rejects.toThrow(
      'Jina Reranker API error: 400 Bad Request',
    );
  });

  describe('retry логика', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('повторяет запрос при 429', async () => {
      const docs: RerankDocument[] = [{ id: 'doc-1', content: 'text' }];

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => makeJinaRerankResponse(docs, [0.9]),
        });

      const reranker = new JinaReranker(DEFAULT_CONFIG);
      const promise = reranker.rerank('query', docs, 1);

      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('повторяет запрос при 5xx', async () => {
      const docs: RerankDocument[] = [{ id: 'doc-1', content: 'text' }];

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => makeJinaRerankResponse(docs, [0.9]),
        });

      const reranker = new JinaReranker(DEFAULT_CONFIG);
      const promise = reranker.rerank('query', docs, 1);

      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('выбрасывает ошибку после исчерпания всех retry-попыток', async () => {
      const docs: RerankDocument[] = [{ id: 'doc-1', content: 'text' }];

      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const reranker = new JinaReranker(DEFAULT_CONFIG);

      let caughtError: Error | undefined;
      const promise = reranker.rerank('query', docs, 1).catch((err: Error) => {
        caughtError = err;
      });

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      await promise;

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toBe('Jina Reranker API error: 429 Too Many Requests');
      // 1 начальная попытка + 3 retry = 4 вызова.
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });
});

describe('NoopReranker', () => {
  it('возвращает документы в исходном порядке с score=1.0', async () => {
    const docs: RerankDocument[] = [
      { id: 'a', content: 'first' },
      { id: 'b', content: 'second' },
      { id: 'c', content: 'third' },
    ];

    const reranker = new NoopReranker();
    const results = await reranker.rerank('query', docs, 3);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ id: 'a', score: 1.0, index: 0 });
    expect(results[1]).toEqual({ id: 'b', score: 1.0, index: 1 });
    expect(results[2]).toEqual({ id: 'c', score: 1.0, index: 2 });
  });

  it('обрезает до topK документов', async () => {
    const docs: RerankDocument[] = [
      { id: 'a', content: 'first' },
      { id: 'b', content: 'second' },
      { id: 'c', content: 'third' },
    ];

    const reranker = new NoopReranker();
    const results = await reranker.rerank('query', docs, 2);

    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('a');
    expect(results[1]!.id).toBe('b');
  });
});

describe('createReranker factory', () => {
  it('создаёт JinaReranker для провайдера jina', () => {
    const reranker = createReranker({
      provider: 'jina',
      jina: {
        apiKey: 'test-key',
        model: 'jina-reranker-v2-base-multilingual',
        topK: 10,
      },
    });

    expect(reranker).toBeInstanceOf(JinaReranker);
  });

  it('создаёт NoopReranker для провайдера none', () => {
    const reranker = createReranker({ provider: 'none' });

    expect(reranker).toBeInstanceOf(NoopReranker);
  });

  it('выбрасывает ошибку, если jina конфиг отсутствует', () => {
    expect(() =>
      createReranker({ provider: 'jina' }),
    ).toThrow('Jina reranker config is required when provider is "jina"');
  });
});
