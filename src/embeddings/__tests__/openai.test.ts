// Тесты для OpenAITextEmbedder.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAITextEmbedder } from '../openai.js';
import { createTextEmbedder } from '../factory.js';

// Генерация фейкового вектора заданной размерности.
function fakeVector(dimensions: number, seed = 0): number[] {
  return Array.from({ length: dimensions }, (_, i) => (i + seed) * 0.001);
}

// Создание мок-ответа OpenAI API.
function makeOpenAIResponse(vectors: number[][]): OpenAIApiResponse {
  return {
    data: vectors.map((embedding, index) => ({ index, embedding })),
  };
}

// Тип ответа OpenAI API для тестов.
interface OpenAIApiResponse {
  data: Array<{ index: number; embedding: number[] }>;
}

// Тело запроса к OpenAI API для проверок.
interface OpenAIRequestBody {
  model: string;
  input: string[];
  dimensions: number;
}

const DEFAULT_CONFIG = {
  apiKey: 'test-api-key',
  model: 'text-embedding-3-small',
  dimensions: 1536,
};

describe('OpenAITextEmbedder', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('embed() возвращает вектор корректной размерности', async () => {
    const vector = fakeVector(1536);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeOpenAIResponse([vector]),
    });

    const embedder = new OpenAITextEmbedder(DEFAULT_CONFIG);
    const result = await embedder.embed('test text');

    expect(result).toHaveLength(1536);
    expect(result).toEqual(vector);
  });

  it('embed() отправляет корректное тело запроса без поля task', async () => {
    const vector = fakeVector(1536);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeOpenAIResponse([vector]),
    });

    const embedder = new OpenAITextEmbedder(DEFAULT_CONFIG);
    await embedder.embed('test text');

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(options.method).toBe('POST');

    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-api-key');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body as string) as OpenAIRequestBody & { task?: string };
    expect(body.model).toBe('text-embedding-3-small');
    expect(body.input).toEqual(['test text']);
    expect(body.dimensions).toBe(1536);
    // OpenAI не использует поле task.
    expect(body.task).toBeUndefined();
  });

  it('embedBatch() разбивает входные данные на батчи по 100', async () => {
    // Создаём 250 элементов — должно быть 3 батча: 100, 100, 50.
    const inputs = Array.from({ length: 250 }, (_, i) => `text ${i}`);
    const dimensions = 128;
    const config = { ...DEFAULT_CONFIG, dimensions };

    fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string) as OpenAIRequestBody;
      const vectors = body.input.map((_, i) => fakeVector(dimensions, i));
      return {
        ok: true,
        status: 200,
        json: async () => makeOpenAIResponse(vectors),
      };
    });

    const embedder = new OpenAITextEmbedder(config);
    const results = await embedder.embedBatch(inputs);

    // Должно быть 3 вызова API.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Проверяем размеры батчей.
    const batchSizes = fetchMock.mock.calls.map((call: unknown[]) => {
      const options = call[1] as RequestInit;
      const body = JSON.parse(options.body as string) as OpenAIRequestBody;
      return body.input.length;
    });
    expect(batchSizes).toEqual([100, 100, 50]);

    // Общее количество результатов.
    expect(results).toHaveLength(250);
  });

  it('embedBatch() возвращает пустой массив для пустого входа', async () => {
    const embedder = new OpenAITextEmbedder(DEFAULT_CONFIG);
    const results = await embedder.embedBatch([]);

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('embedQuery() идентична embed() (нет поля task)', async () => {
    const vector = fakeVector(1536);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeOpenAIResponse([vector]),
    });

    const embedder = new OpenAITextEmbedder(DEFAULT_CONFIG);
    const result = await embedder.embedQuery('search query');

    expect(result).toEqual(vector);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as OpenAIRequestBody & { task?: string };
    expect(body.input).toEqual(['search query']);
    expect(body.task).toBeUndefined();
  });

  it('выбрасывает ошибку при не-ok статусе ответа API', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const embedder = new OpenAITextEmbedder(DEFAULT_CONFIG);

    await expect(embedder.embed('test')).rejects.toThrow(
      'OpenAI API error: 400 Bad Request',
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
      const vector = fakeVector(1536);

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => makeOpenAIResponse([vector]),
        });

      const embedder = new OpenAITextEmbedder(DEFAULT_CONFIG);
      const promise = embedder.embed('test');

      // rateLimitDelayMs = 60_000, attempt=1 → задержка 60s.
      await vi.advanceTimersByTimeAsync(60_000);

      const result = await promise;

      expect(result).toEqual(vector);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('повторяет запрос при 5xx ошибке сервера', async () => {
      const vector = fakeVector(1536);

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => makeOpenAIResponse([vector]),
        });

      const embedder = new OpenAITextEmbedder(DEFAULT_CONFIG);
      const promise = embedder.embed('test');

      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result).toEqual(vector);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('выбрасывает ошибку после исчерпания всех retry-попыток', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const embedder = new OpenAITextEmbedder(DEFAULT_CONFIG);

      let caughtError: Error | undefined;
      const promise = embedder.embed('test').catch((err: Error) => {
        caughtError = err;
      });

      // rateLimitDelayMs = 60_000: attempt 1 → 60s, attempt 2 → 120s, attempt 3 → 180s.
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(120_000);
      await vi.advanceTimersByTimeAsync(180_000);

      await promise;

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toBe('OpenAI API error: 429 Too Many Requests');
      // 1 начальная попытка + 3 retry = 4 вызова.
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  it('dimensions доступен как свойство', () => {
    const embedder = new OpenAITextEmbedder(DEFAULT_CONFIG);
    expect(embedder.dimensions).toBe(1536);

    const customEmbedder = new OpenAITextEmbedder({
      ...DEFAULT_CONFIG,
      dimensions: 256,
    });
    expect(customEmbedder.dimensions).toBe(256);
  });
});

describe('OpenAITextEmbedder (baseUrl + providerName)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('использует кастомный baseUrl для запросов', async () => {
    const vector = fakeVector(1024);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeOpenAIResponse([vector]),
    });

    const embedder = new OpenAITextEmbedder({
      apiKey: 'sf-key',
      model: 'Qwen/Qwen3-Embedding-0.6B',
      dimensions: 1024,
      baseUrl: 'https://api.siliconflow.com/v1/embeddings',
      providerName: 'SiliconFlow API',
    });
    await embedder.embed('test');

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.siliconflow.com/v1/embeddings');
  });

  it('использует дефолтный OpenAI URL когда baseUrl не указан', async () => {
    const vector = fakeVector(1536);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeOpenAIResponse([vector]),
    });

    const embedder = new OpenAITextEmbedder(DEFAULT_CONFIG);
    await embedder.embed('test');

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
  });

  it('использует providerName в сообщении об ошибке', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const embedder = new OpenAITextEmbedder({
      ...DEFAULT_CONFIG,
      providerName: 'SiliconFlow API',
    });

    await expect(embedder.embed('test')).rejects.toThrow(
      'SiliconFlow API error: 400 Bad Request',
    );
  });
});

describe('createTextEmbedder (openai)', () => {
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
    expect(embedder.dimensions).toBe(1536);
  });

  it('выбрасывает ошибку, если openai конфиг отсутствует', () => {
    expect(() =>
      createTextEmbedder({ provider: 'openai' }),
    ).toThrow('OpenAI embeddings config is required when provider is "openai"');
  });
});

describe('createTextEmbedder (siliconflow)', () => {
  it('создаёт OpenAITextEmbedder для провайдера siliconflow', () => {
    const embedder = createTextEmbedder({
      provider: 'siliconflow',
      siliconflow: {
        apiKey: 'sf-key',
        model: 'Qwen/Qwen3-Embedding-0.6B',
        dimensions: 1024,
      },
    });

    expect(embedder).toBeInstanceOf(OpenAITextEmbedder);
    expect(embedder.dimensions).toBe(1024);
  });

  it('выбрасывает ошибку, если siliconflow конфиг отсутствует', () => {
    expect(() =>
      createTextEmbedder({ provider: 'siliconflow' }),
    ).toThrow('SiliconFlow embeddings config is required when provider is "siliconflow"');
  });
});
