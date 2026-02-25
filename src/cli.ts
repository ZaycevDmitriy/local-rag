#!/usr/bin/env node

// Точка входа CLI для индексации.
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { indexCommand } from './commands/index-cmd.js';

const program = new Command()
  .name('rag')
  .description('Local RAG — semantic search for code and docs')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(indexCommand);

program.parse();
