import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Static guard: MCP-reachable code must not invoke console.log
// since src/mcp-entry.ts reserves stdout for the JSON-RPC protocol.
// Logs on the success path go through console.error (stderr).
// Источник правила: .ai-factory/RULES.md #14.

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(CURRENT_DIR, '..', '..', '..');

// Файлы, которые исполняются при обработке MCP-tool вызовов
// (search / read_source / list_sources / status). Для них console.log
// категорически запрещён на любых путях — иначе ломается JSON-RPC.
// chunk-contents.ts находится здесь целиком: часть методов MCP-reachable
// (searchBm25/searchVector/searchSummaryVector/hasSummaryForViews на горячем пути
// SearchCoordinator.searchBranchAware), а остальные методы (insertBatch,
// updateEmbeddings, deleteOrphans) унифицированы под ту же дисциплину, чтобы
// случайный future-caller из MCP-пути не сломал JSON-RPC.
const MCP_REACHABLE_FILES = [
  'src/embeddings/openai.ts',
  'src/search/coordinator.ts',
  'src/mcp/tools/read-source.ts',
  'src/mcp/tools/search.ts',
  'src/mcp/tools/list-sources.ts',
  'src/mcp/tools/status.ts',
  'src/storage/chunk-contents.ts',
];

// Shared-файлы (CLI + MCP). console.log запрещён в конкретных
// MCP-reachable методах; остальные методы — CLI-only и могут логировать.
const MCP_REACHABLE_METHODS: Array<{
  file: string;
  methods: string[];
}> = [
  {
    file: 'src/storage/chunks.ts',
    methods: ['getContentHashes', 'resolveOccurrences'],
  },
];

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf-8');
}

// Возвращает тело метода по имени. Упрощённый парсер без tree-sitter:
// ищем `async methodName(` или `methodName(` и забираем блок до закрывающей
// фигурной скобки того же уровня вложенности.
function extractMethodBody(source: string, methodName: string): string {
  const pattern = new RegExp(`(?:async\\s+)?${methodName}\\s*(?:<[^>]*>)?\\s*\\(`);
  const match = pattern.exec(source);
  if (!match) {
    throw new Error(`method "${methodName}" not found`);
  }

  const openingBraceIdx = source.indexOf('{', match.index);
  if (openingBraceIdx === -1) {
    throw new Error(`opening brace for "${methodName}" not found`);
  }

  let depth = 1;
  let idx = openingBraceIdx + 1;
  while (idx < source.length && depth > 0) {
    const ch = source[idx];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    idx += 1;
  }

  if (depth !== 0) {
    throw new Error(`unbalanced braces in "${methodName}"`);
  }

  return source.slice(openingBraceIdx, idx);
}

describe('MCP stdout discipline', () => {
  for (const relativePath of MCP_REACHABLE_FILES) {
    it(`${relativePath} не содержит console.log`, () => {
      const content = readRepoFile(relativePath);
      const matches = content.match(/console\.log\s*\(/g) ?? [];
      expect(matches, `console.log найден в ${relativePath}`).toHaveLength(0);
    });
  }

  for (const { file, methods } of MCP_REACHABLE_METHODS) {
    for (const methodName of methods) {
      it(`${file}:${methodName} не содержит console.log`, () => {
        const content = readRepoFile(file);
        const body = extractMethodBody(content, methodName);
        const matches = body.match(/console\.log\s*\(/g) ?? [];
        expect(
          matches,
          `console.log найден в методе ${methodName} (${file})`,
        ).toHaveLength(0);
      });
    }
  }

  // Миграции — CLI-only путь (`rag init`), но тот же принцип stdout-дисциплины:
  // при запуске инициализации из orchestrator'а stdout не должен забиваться
  // информационными сообщениями. Regression-guard на случай будущих миграций.
  describe('storage/migrations: вспомогательные логи через stderr', () => {
    const migrationsDir = resolve(REPO_ROOT, 'src/storage/migrations');
    const migrationFiles = readdirSync(migrationsDir)
      .filter((name) => /^\d{3}_.+\.ts$/.test(name));

    for (const name of migrationFiles) {
      it(`${name} не содержит console.log`, () => {
        const content = readRepoFile(`src/storage/migrations/${name}`);
        const matches = content.match(/console\.log\s*\(/g) ?? [];
        expect(
          matches,
          `console.log найден в миграции ${name}: используйте console.error`,
        ).toHaveLength(0);
      });
    }
  });
});
