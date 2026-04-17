// Типы модуля summarization.

// Вход для суммаризации одного чанка.
// Содержит минимум полей, необходимых для prompt (Path/Kind/fqn/---/content).
export interface SummarizerInput {
  path: string;
  // Тип фрагмента — CLASS/FUNCTION/METHOD/TYPE/INTERFACE/markdown-section/text и т.п.
  // Используется для skip-gate и построения Kind-строки в промте.
  kind: string;
  // Полностью квалифицированное имя (опционально).
  fqn?: string;
  // Язык файла (ts, py, md и т.п.) — для информативности промта.
  language?: string;
  // Содержит ли чанк docstring / JSDoc / Javadoc / Kotlin-doc.
  // Используется skip-gate для TYPE/INTERFACE без документации.
  hasDocstring?: boolean;
  content: string;
}

// Результат работы Summarizer.summarize.
// summary = null означает отказ (skip, ошибка провайдера) — caller НЕ должен upgradeить его в исключение.
// reason — опциональная причина null для логирования.
export interface SummarizerResult {
  summary: string | null;
  reason?: string;
}

// Интерфейс суммаризатора. Контракт: summarize(input) — idempotent, не бросает исключения
// на провайдерских ошибках (возвращает { summary: null, reason }); бросает только на
// ошибках валидации входа или OOM/unrecoverable.
export interface Summarizer {
  summarize(input: SummarizerInput): Promise<SummarizerResult>;
}
