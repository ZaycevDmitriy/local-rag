import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JinaTextEmbedder } from '../jina.js';
import { OpenAITextEmbedder } from '../openai.js';
import { createTextEmbedder } from '../factory.js';

// Генерация фейкового вектора заданной размерности.
function fakeVector(dimensions: number, seed = 0): number[] {
  return Array.from({ length: dimensions }, (_, i) => (i + seed) * 0.001);
}

// Создание мок-ответа Jina API.
function makeJinaResponse(vectors: number[][]): JinaApiResponse {
  return {
    data: vectors.map((embedding, index) => ({ index, embedding })),
  };
}

// Тип ответа Jina API для тестов.
interface JinaApiResponse {
  data: Array<{ index: number; embedding: number[] }>;
}

// Тело запроса к Jina API для проверок.
interface JinaRequestBody {
  model: string;
  input: string[];
  task: string;
  dimensions: number;
}

const DEFAULT_CONFIG = {
  apiKey: 'test-api-key',
  model: 'jina-embeddings-v3',
  dimensions: 1024,
};

describe('JinaTextEmbedder', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('embed() возвращает вектор корректной размерности', async () => {
    const vector = fakeVector(1024);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeJinaResponse([vector]),
    });

    const embedder = new JinaTextEmbedder(DEFAULT_CONFIG);
    const result = await embedder.embed('test text');

    expect(result).toHaveLength(1024);
    expect(result).toEqual(vector);
  });

  it('embed() отправляет корректное тело запроса с task: retrieval.passage', async () => {
    const vector = fakeVector(1024);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeJinaResponse([vector]),
    });

    const embedder = new JinaTextEmbedder(DEFAULT_CONFIG);
    await embedder.embed('test text');

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.jina.ai/v1/embeddings');
    expect(options.method).toBe('POST');

    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-api-key');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body as string) as JinaRequestBody;
    expect(body.model).toBe('jina-embeddings-v3');
    expect(body.input).toEqual(['test text']);
    expect(body.task).toBe('retrieval.passage');
    expect(body.dimensions).toBe(1024);
  });

  it('embedBatch() разбивает входные данные на батчи по 64', async () => {
    // Создаём 150 элементов — должно быть 3 батча: 64, 64, 22.
    const inputs = Array.from({ length: 150 }, (_, i) => `text ${i}`);
    const dimensions = 128;
    const config = { ...DEFAULT_CONFIG, dimensions };

    fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string) as JinaRequestBody;
      const vectors = body.input.map((_, i) => fakeVector(dimensions, i));
      return {
        ok: true,
        status: 200,
        json: async () => makeJinaResponse(vectors),
      };
    });

    const embedder = new JinaTextEmbedder(config);
    const results = await embedder.embedBatch(inputs);

    // Должно быть 3 вызова API.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Проверяем размеры батчей.
    const batchSizes = fetchMock.mock.calls.map((call: unknown[]) => {
      const options = call[1] as RequestInit;
      const body = JSON.parse(options.body as string) as JinaRequestBody;
      return body.input.length;
    });
    expect(batchSizes).toEqual([64, 64, 22]);

    // Общее количество результатов.
    expect(results).toHaveLength(150);
  });

  it('embedBatch() возвращает результаты в правильном порядке', async () => {
    const dimensions = 4;
    const inputs = ['first', 'second', 'third'];
    const config = { ...DEFAULT_CONFIG, dimensions };

    const vectors = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeJinaResponse(vectors),
    });

    const embedder = new JinaTextEmbedder(config);
    const results = await embedder.embedBatch(inputs);

    expect(results).toEqual(vectors);
    expect(results[0]).toEqual([1, 0, 0, 0]);
    expect(results[1]).toEqual([0, 1, 0, 0]);
    expect(results[2]).toEqual([0, 0, 1, 0]);
  });

  it('embedBatch() возвращает пустой массив для пустого входа', async () => {
    const embedder = new JinaTextEmbedder(DEFAULT_CONFIG);
    const results = await embedder.embedBatch([]);

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('embedQuery() использует task: retrieval.query', async () => {
    const vector = fakeVector(1024);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeJinaResponse([vector]),
    });

    const embedder = new JinaTextEmbedder(DEFAULT_CONFIG);
    const result = await embedder.embedQuery('search query');

    expect(result).toEqual(vector);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as JinaRequestBody;
    expect(body.task).toBe('retrieval.query');
    expect(body.input).toEqual(['search query']);
  });

  it('выбрасывает ошибку при не-ok статусе ответа API', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const embedder = new JinaTextEmbedder(DEFAULT_CONFIG);

    await expect(embedder.embed('test')).rejects.toThrow(
      'Jina API error: 400 Bad Request',
    );
  });

  describe('retry логика', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('повторяет запрос при 429 (rate limit)', async () => {
      const vector = fakeVector(1024);

      // Первый вызов — 429, второй — успех.
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => makeJinaResponse([vector]),
        });

      const embedder = new JinaTextEmbedder(DEFAULT_CONFIG);
      const promise = embedder.embed('test');

      // При 429 первый retry delay = 60_000ms * 1 = 60с.
      await vi.advanceTimersByTimeAsync(60_000);

      const result = await promise;

      expect(result).toEqual(vector);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('повторяет запрос при 5xx ошибке сервера', async () => {
      const vector = fakeVector(1024);

      // Первый вызов — 500, второй — успех.
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => makeJinaResponse([vector]),
        });

      const embedder = new JinaTextEmbedder(DEFAULT_CONFIG);
      const promise = embedder.embed('test');

      // Продвигаем таймер на 1с (первый retry delay).
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result).toEqual(vector);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('выбрасывает ошибку после исчерпания всех retry-попыток', async () => {
      // Все вызовы — 429.
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const embedder = new JinaTextEmbedder(DEFAULT_CONFIG);

      // Запускаем запрос и сразу ловим rejection, чтобы избежать unhandled rejection.
      let caughtError: Error | undefined;
      const promise = embedder.embed('test').catch((err: Error) => {
        caughtError = err;
      });

      // При 429 delays = 60_000 * attempt: 60с, 120с, 180с, 240с, 300с (MAX_RETRIES=5).
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(120_000);
      await vi.advanceTimersByTimeAsync(180_000);
      await vi.advanceTimersByTimeAsync(240_000);
      await vi.advanceTimersByTimeAsync(300_000);

      await promise;

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toBe('Jina API error: 429 Too Many Requests');

      // 1 начальная попытка + 5 retry = 6 вызовов.
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });
  });

  it('dimensions доступен как свойство', () => {
    const embedder = new JinaTextEmbedder(DEFAULT_CONFIG);
    expect(embedder.dimensions).toBe(1024);

    const customEmbedder = new JinaTextEmbedder({
      ...DEFAULT_CONFIG,
      dimensions: 512,
    });
    expect(customEmbedder.dimensions).toBe(512);
  });
});

describe('createTextEmbedder', () => {
  it('создаёт JinaTextEmbedder для провайдера jina', () => {
    const embedder = createTextEmbedder({
      provider: 'jina',
      jina: {
        apiKey: 'test-key',
        model: 'jina-embeddings-v3',
        dimensions: 1024,
      },
    });

    expect(embedder).toBeInstanceOf(JinaTextEmbedder);
    expect(embedder.dimensions).toBe(1024);
  });

  it('выбрасывает ошибку, если jina конфиг отсутствует', () => {
    expect(() =>
      createTextEmbedder({ provider: 'jina' }),
    ).toThrow('Jina embeddings config is required when provider is "jina"');
  });

  it('создаёт OpenAITextEmbedder для провайдера openai', () => {
    const embedder = createTextEmbedder({
      provider: 'openai',
      openai: {
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        dimensions: 1536,
      },
    });
    expect(embedder).toBeInstanceOf(OpenAITextEmbedder);
  });

  it('выбрасывает ошибку для провайдера self-hosted (ещё не реализован)', () => {
    expect(() =>
      createTextEmbedder({ provider: 'self-hosted' }),
    ).toThrow('Self-hosted embedder not implemented yet');
  });
});
