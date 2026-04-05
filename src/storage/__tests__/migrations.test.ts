import { describe, it, expect } from 'vitest';
import { createBranchViewsRebuildMigration } from '../migrations/005_branch_views_rebuild.js';

describe('005_branch_views_rebuild', () => {
  it('создаёт миграцию с корректным именем', () => {
    const migration = createBranchViewsRebuildMigration(1024);

    expect(migration.name).toBe('005_branch_views_rebuild');
    expect(typeof migration.up).toBe('function');
  });

  it('принимает произвольную размерность вектора', () => {
    const migration1024 = createBranchViewsRebuildMigration(1024);
    const migration1536 = createBranchViewsRebuildMigration(1536);

    // Обе миграции должны иметь одинаковое имя (размерность — runtime-параметр).
    expect(migration1024.name).toBe(migration1536.name);
  });

  it('фабрика возвращает объект Migration с методом up', () => {
    const migration = createBranchViewsRebuildMigration(768);

    expect(migration).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        up: expect.any(Function),
      }),
    );
  });
});
