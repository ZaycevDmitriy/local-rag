// SiliconFlow Summarizer — chat-completions (OpenAI-совместимый API).
// Ошибка провайдера превращается в { summary: null, reason }, чтобы один
// плохой чанк не ломал весь backfill-батч.
import { fetchWithRetry } from '../utils/index.js';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt.js';
import type { Summarizer, SummarizerInput, SummarizerResult } from './types.js';

// Конфигурация SiliconFlowSummarizer.
interface SiliconFlowSummarizerConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}

// Минимальный тип ответа OpenAI-compat chat-completions.
interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

// Параметры генерации — фиксируем невысокую температуру, чтобы summary был детерминированным.
const GENERATION_TEMPERATURE = 0.2;
const MAX_OUTPUT_TOKENS = 300;

// Префикс для логов/ошибок.
const PROVIDER_NAME = 'SiliconFlow summarize';

// Реализация Summarizer через SiliconFlow chat-completions.
export class SiliconFlowSummarizer implements Summarizer {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: SiliconFlowSummarizerConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;
  }

  async summarize(input: SummarizerInput): Promise<SummarizerResult> {
    if (!input.content || input.content.trim().length === 0) {
      return { summary: null, reason: 'empty content' };
    }

    const body = JSON.stringify({
      model: this.model,
      temperature: GENERATION_TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    });

    let response: Response;
    try {
      response = await fetchWithRetry(
        this.baseUrl,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
        },
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          rateLimitDelayMs: 60_000,
          timeoutMs: this.timeoutMs,
          errorPrefix: PROVIDER_NAME,
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SiliconFlowSummarizer] request failed: ${msg}`);
      return { summary: null, reason: `request-failed: ${msg}` };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(
        `[SiliconFlowSummarizer] HTTP ${response.status} ${response.statusText}: ${text.slice(0, 200)}`,
      );
      return {
        summary: null,
        reason: `http-${response.status}`,
      };
    }

    const text = await response.text();
    let parsed: ChatCompletionResponse;
    try {
      parsed = JSON.parse(text) as ChatCompletionResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[SiliconFlowSummarizer] Malformed JSON: ${msg}. Body preview: ${text.slice(0, 200)}`,
      );
      return { summary: null, reason: `malformed-json: ${msg}` };
    }

    const content = parsed.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.error(
        `[SiliconFlowSummarizer] Empty message content. Body preview: ${text.slice(0, 200)}`,
      );
      return { summary: null, reason: 'empty-content' };
    }

    return { summary: content };
  }
}
