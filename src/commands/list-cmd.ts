// Команда rag list — список источников с view metadata.
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { createDb, closeDb, SourceStorage, SourceViewStorage } from '../storage/index.js';

export const listCommand = new Command('list')
  .description('List all indexed sources')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options: { config?: string }) => {
    try {
      const config = await loadConfig(options.config);
      const sql = createDb(config.database);

      try {
        const sourceStorage = new SourceStorage(sql);
        const sourceViewStorage = new SourceViewStorage(sql);
        const sources = await sourceStorage.getAll();

        if (sources.length === 0) {
          console.log('Источники не найдены.');
          return;
        }

        const COL_NAME = 30;
        const COL_TYPE = 8;
        const COL_VIEW = 20;
        const COL_CHUNKS = 10;
        const COL_DATE = 22;

        const header =
          'Имя'.padEnd(COL_NAME) + ' ' +
          'Тип'.padEnd(COL_TYPE) + ' ' +
          'Active View'.padEnd(COL_VIEW) + ' ' +
          'Chunks'.padEnd(COL_CHUNKS) + ' ' +
          'Индексация'.padEnd(COL_DATE) + ' ' +
          'Путь';

        console.log('');
        console.log(header);
        console.log('-'.repeat(header.length + 20));

        let totalChunks = 0;
        let totalViews = 0;

        for (const source of sources) {
          const views = await sourceViewStorage.listBySource(source.id);
          const activeView = views.find((v) => v.id === source.active_view_id);
          totalViews += views.length;

          const name = source.name.slice(0, COL_NAME - 1).padEnd(COL_NAME);
          const type = source.type.padEnd(COL_TYPE);

          const viewStr = activeView
            ? `${activeView.view_kind}:${activeView.ref_name ?? ''}`.slice(0, COL_VIEW - 1).padEnd(COL_VIEW)
            : '—'.padEnd(COL_VIEW);

          const chunkCount = activeView
            ? String(activeView.chunk_count).padEnd(COL_CHUNKS)
            : '0'.padEnd(COL_CHUNKS);

          const lastIndexed = source.last_indexed_at
            ? new Date(source.last_indexed_at).toLocaleString('ru-RU').padEnd(COL_DATE)
            : 'никогда'.padEnd(COL_DATE);

          const path = source.path ?? source.git_url ?? '';

          console.log(`${name} ${type} ${viewStr} ${chunkCount} ${lastIndexed} ${path}`);
          totalChunks += activeView?.chunk_count ?? 0;
        }

        console.log('');
        console.log(`Итого: ${sources.length} источников, ${totalViews} views, ${totalChunks} фрагментов`);
      } finally {
        await closeDb(sql);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Ошибка команды rag list: ${message}`);
      process.exit(1);
    }
  });
