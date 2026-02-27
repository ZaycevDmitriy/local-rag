// Санитизация конфига — копирует raw YAML без подстановки env-переменных.
import { copyFile } from 'node:fs/promises';

// Копирует конфиг-файл без подстановки переменных окружения.
// ${ENV_VAR} плейсхолдеры остаются нерезолвленными.
export async function sanitizeConfig(configPath: string, outputPath: string): Promise<void> {
  await copyFile(configPath, outputPath);
}
