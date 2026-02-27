#!/usr/bin/env node

// Точка входа CLI для индексации.
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { indexCommand } from './commands/index-cmd.js';
import { listCommand } from './commands/list-cmd.js';
import { removeCommand } from './commands/remove-cmd.js';
import { statusCommand } from './commands/status-cmd.js';
import { exportCommand } from './commands/export-cmd.js';
import { importCommand } from './commands/import-cmd.js';
import { reEmbedCommand } from './commands/re-embed-cmd.js';

const program = new Command()
  .name('rag')
  .description('Local RAG — semantic search for code and docs')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(indexCommand);
program.addCommand(listCommand);
program.addCommand(removeCommand);
program.addCommand(statusCommand);
program.addCommand(exportCommand);
program.addCommand(importCommand);
program.addCommand(reEmbedCommand);

program.parse();
