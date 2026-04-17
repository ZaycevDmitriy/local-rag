// Тесты SiliconFlowSummarizer с mock fetch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SiliconFlowSummarizer } from '../siliconflow.js';
import type { SummarizerInput } from '../types.js';

const CONFIG = {
  apiKey: 'test-key',
  model: 'Qwen/Qwen2.5-7B-Instruct',
  baseUrl: 'https://api.siliconflow.com/v1/chat/completions',
  timeoutMs: 5_000,
};

const SAMPLE_INPUT: SummarizerInput = {
  path: 'src/auth.ts',
  kind: 'FUNCTION',
  fqn: 'auth.login.refresh',
  language: 'typescript',
  content: 'function refresh() { return token; }',
};

// Мок успешного chat-completions ответа.
function chatResponse(content: string): unknown {
  return {
    choices: [{ message: { content } }],
  };
}

describe('SiliconFlowSummarizer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: возвращает summary из message.content', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(chatResponse('This function refreshes the auth token.')),
    });

    const s = new SiliconFlowSummarizer(CONFIG);
    const result = await s.summarize(SAMPLE_INPUT);

    expect(result.summary).toBe('This function refreshes the auth token.');
    expect(result.reason).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe(CONFIG.baseUrl);
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body.model).toBe(CONFIG.model);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
  });

  it('retry при 429 до успеха', async () => {
    vi.useFakeTimers();

    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify(chatResponse('ok')),
      });

    const s = new SiliconFlowSummarizer(CONFIG);
    const promise = s.summarize(SAMPLE_INPUT);

    // Прокручиваем таймеры для retry-задержки.
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.summary).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('HTTP ошибка 400 → summary=null с reason http-400 (не бросает)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'bad request',
    });

    const s = new SiliconFlowSummarizer(CONFIG);
    const result = await s.summarize(SAMPLE_INPUT);

    expect(result.summary).toBeNull();
    expect(result.reason).toMatch(/http-400/);
  });

  it('пустой message.content → summary=null с reason empty-content', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ choices: [{ message: { content: '   ' } }] }),
    });

    const s = new SiliconFlowSummarizer(CONFIG);
    const result = await s.summarize(SAMPLE_INPUT);

    expect(result.summary).toBeNull();
    expect(result.reason).toMatch(/empty-content/);
  });

  it('malformed JSON → summary=null с reason malformed-json', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '{not-json',
    });

    const s = new SiliconFlowSummarizer(CONFIG);
    const result = await s.summarize(SAMPLE_INPUT);

    expect(result.summary).toBeNull();
    expect(result.reason).toMatch(/malformed-json/);
  });

  it('пустой content → summary=null без HTTP запроса', async () => {
    const s = new SiliconFlowSummarizer(CONFIG);
    const result = await s.summarize({ ...SAMPLE_INPUT, content: '' });
    expect(result.summary).toBeNull();
    expect(result.reason).toMatch(/empty content/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
