import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { AppConfigSchema } from './schema.js';
import { defaultConfig } from './defaults.js';
import type { AppConfig } from './schema.js';

// Паттерн для подстановки переменных окружения: ${ENV_VAR}.
const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

/**
 * Рекурсивно обходит объект и заменяет строки вида ${ENV_VAR}
 * на значения из process.env. Если переменная не найдена — оставляет как есть.
 */
export function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(ENV_VAR_PATTERN, (_match, varName: string) => {
      const value = process.env[varName];
      if (value === undefined) {
        return _match;
      }
      return value;
    });
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVars(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value);
    }
    return result;
  }

  // Числа, boolean, null — возвращаем без изменений.
  return obj;
}

/**
 * Рекурсивный deep-merge двух объектов.
 * Значения из source перезаписывают target, кроме случаев когда оба значения — объекты.
 * Массивы из source полностью заменяют массивы в target (не сливаются).
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const result = { ...target } as Record<string, unknown>;

  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = result[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      // Оба значения — объекты, сливаем рекурсивно.
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      );
    } else {
      // Во всех остальных случаях source перезаписывает target.
      result[key] = sourceValue;
    }
  }

  return result as T;
}

/**
 * Проверяет существование файла по указанному пути.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Определяет путь к конфиг-файлу.
 * Порядок поиска:
 * 0. Переданный configPath (--config). При отсутствии файла — throw Error.
 * 1. RAG_CONFIG env var. При отсутствии файла — throw Error.
 * 2. ./rag.config.yaml (текущая директория).
 * 3. ~/.config/rag/config.yaml (домашняя директория).
 */
export async function resolveConfigPath(configPath?: string): Promise<string | null> {
  if (configPath) {
    const resolved = resolve(configPath);
    if (await fileExists(resolved)) {
      return resolved;
    }
    throw new Error(`Config file not found at path: ${resolved}`);
  }

  // Шаг 1: переменная окружения RAG_CONFIG.
  const envConfigPath = process.env['RAG_CONFIG'];
  if (envConfigPath) {
    const resolved = resolve(envConfigPath);
    if (await fileExists(resolved)) {
      return resolved;
    }
    throw new Error(`Config file not found at RAG_CONFIG path: ${resolved}`);
  }

  // Поиск в текущей директории.
  const localPath = resolve('rag.config.yaml');
  if (await fileExists(localPath)) {
    return localPath;
  }

  // Поиск в домашней директории.
  const globalPath = join(homedir(), '.config', 'rag', 'config.yaml');
  if (await fileExists(globalPath)) {
    return globalPath;
  }

  return null;
}

/**
 * Загружает конфигурацию из YAML-файла.
 *
 * 1. Определяет путь к конфиг-файлу (аргумент или поиск).
 * 2. Читает YAML.
 * 3. Подставляет переменные окружения (resolveEnvVars).
 * 4. Deep merge с дефолтами.
 * 5. Валидирует через AppConfigSchema.parse().
 * 6. Возвращает AppConfig.
 *
 * Если конфиг-файл не найден — возвращает дефолтный конфиг.
 */
export async function loadConfig(configPath?: string): Promise<AppConfig> {
  const resolvedPath = await resolveConfigPath(configPath);

  if (!resolvedPath) {
    // Конфиг-файл не найден — используем дефолты.
    return AppConfigSchema.parse(defaultConfig);
  }

  const raw = await readFile(resolvedPath, 'utf-8');
  const parsed = parseYaml(raw) as Record<string, unknown> | null;

  if (!parsed || typeof parsed !== 'object') {
    // Пустой или невалидный YAML — используем дефолты.
    return AppConfigSchema.parse(defaultConfig);
  }

  // Подставляем переменные окружения.
  const withEnvVars = resolveEnvVars(parsed) as Record<string, unknown>;

  // Сливаем с дефолтами (пользовательские значения имеют приоритет).
  const merged = deepMerge(
    defaultConfig as unknown as Record<string, unknown>,
    withEnvVars,
  );

  // Валидируем и возвращаем.
  return AppConfigSchema.parse(merged);
}
