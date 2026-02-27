import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml } from 'yaml';
import { loadConfig, resolveEnvVars, deepMerge } from '../loader.js';
import { AppConfigSchema } from '../schema.js';

// Временная директория для тестовых конфигов.
const TEST_DIR = join(tmpdir(), 'local-rag-config-test');

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// --- resolveEnvVars ---

describe('resolveEnvVars', () => {
  it('заменяет ${ENV_VAR} на значение из process.env', () => {
    process.env['TEST_RAG_VAR'] = 'my-secret';
    const result = resolveEnvVars('key=${TEST_RAG_VAR}');
    expect(result).toBe('key=my-secret');
    delete process.env['TEST_RAG_VAR'];
  });

  it('оставляет ${ENV_VAR} как есть, если переменная не найдена', () => {
    delete process.env['NONEXISTENT_VAR'];
    const result = resolveEnvVars('${NONEXISTENT_VAR}');
    expect(result).toBe('${NONEXISTENT_VAR}');
  });

  it('обрабатывает вложенные объекты', () => {
    process.env['TEST_HOST'] = 'db.example.com';
    process.env['TEST_PORT'] = '5433';

    const input = {
      database: {
        host: '${TEST_HOST}',
        port: '${TEST_PORT}',
      },
    };
    const result = resolveEnvVars(input) as Record<string, unknown>;
    const db = result['database'] as Record<string, unknown>;

    expect(db['host']).toBe('db.example.com');
    expect(db['port']).toBe('5433');

    delete process.env['TEST_HOST'];
    delete process.env['TEST_PORT'];
  });

  it('обрабатывает массивы', () => {
    process.env['TEST_PATTERN'] = '**/*.ts';
    const input = ['${TEST_PATTERN}', 'plain-string'];
    const result = resolveEnvVars(input);

    expect(result).toEqual(['**/*.ts', 'plain-string']);
    delete process.env['TEST_PATTERN'];
  });

  it('не изменяет числа, boolean и null', () => {
    expect(resolveEnvVars(42)).toBe(42);
    expect(resolveEnvVars(true)).toBe(true);
    expect(resolveEnvVars(null)).toBe(null);
  });

  it('заменяет несколько переменных в одной строке', () => {
    process.env['TEST_USER'] = 'admin';
    process.env['TEST_PASS'] = 'secret';

    const result = resolveEnvVars('${TEST_USER}:${TEST_PASS}');
    expect(result).toBe('admin:secret');

    delete process.env['TEST_USER'];
    delete process.env['TEST_PASS'];
  });
});

// --- deepMerge ---

describe('deepMerge', () => {
  it('рекурсивно сливает объекты', () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    const source = { a: { b: 10 }, e: 5 };
    const result = deepMerge(target, source);

    expect(result).toEqual({ a: { b: 10, c: 2 }, d: 3, e: 5 });
  });

  it('массивы из source полностью заменяют массивы в target', () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    const result = deepMerge(target, source);

    expect(result).toEqual({ items: [4, 5] });
  });

  it('не мутирует исходные объекты', () => {
    const target = { a: { b: 1 } };
    const source = { a: { c: 2 } };
    const targetCopy = JSON.parse(JSON.stringify(target));

    deepMerge(target, source);

    expect(target).toEqual(targetCopy);
  });
});

// --- AppConfigSchema ---

describe('AppConfigSchema', () => {
  it('парсит пустой объект с дефолтными значениями', () => {
    const config = AppConfigSchema.parse({});

    expect(config.database.host).toBe('localhost');
    expect(config.database.port).toBe(5432);
    expect(config.database.name).toBe('local_rag');
    expect(config.search.bm25Weight).toBe(0.4);
    expect(config.search.vectorWeight).toBe(0.6);
    expect(config.search.rrf.k).toBe(60);
    expect(config.reranker.provider).toBe('none');
    expect(config.sources).toEqual([]);
    expect(config.indexing.chunkSize.maxTokens).toBe(1000);
    expect(config.indexing.chunkSize.overlap).toBe(100);
    expect(config.indexing.git.cloneDir).toBe('~/.local/share/rag/repos');
  });

  it('выбрасывает ошибку при невалидном provider', () => {
    expect(() => {
      AppConfigSchema.parse({
        embeddings: { provider: 'invalid' },
      });
    }).toThrow();
  });

  it('принимает частичную конфигурацию с переопределением дефолтов', () => {
    const config = AppConfigSchema.parse({
      database: { host: 'custom-host', port: 3306 },
      search: { finalTopK: 20 },
    });

    expect(config.database.host).toBe('custom-host');
    expect(config.database.port).toBe(3306);
    // Остальные поля database — из дефолтов.
    expect(config.database.name).toBe('local_rag');
    expect(config.search.finalTopK).toBe(20);
    // Остальные поля search — из дефолтов.
    expect(config.search.bm25Weight).toBe(0.4);
  });

  it('парсит конфиг с источниками', () => {
    const config = AppConfigSchema.parse({
      sources: [
        {
          name: 'my-project',
          type: 'local',
          path: '/home/user/project',
          include: ['**/*.ts'],
          exclude: ['node_modules/**'],
        },
        {
          name: 'remote-repo',
          type: 'git',
          url: 'https://github.com/user/repo.git',
          branch: 'main',
        },
      ],
    });

    expect(config.sources).toHaveLength(2);
    expect(config.sources[0]!.name).toBe('my-project');
    expect(config.sources[0]!.type).toBe('local');
    expect(config.sources[1]!.type).toBe('git');
    expect(config.sources[1]!.branch).toBe('main');
  });
});

// --- loadConfig ---

describe('loadConfig', () => {
  it('загружает валидный YAML-конфиг', async () => {
    const configData = {
      database: {
        host: 'test-host',
        port: 5433,
        name: 'test_db',
        user: 'test_user',
        password: 'test_pass',
      },
      embeddings: {
        provider: 'jina',
        jina: {
          apiKey: 'test-key',
          model: 'jina-embeddings-v3',
          dimensions: 1024,
        },
      },
    };

    const configPath = join(TEST_DIR, 'rag.config.yaml');
    await writeFile(configPath, stringifyYaml(configData));

    const config = await loadConfig(configPath);

    expect(config.database.host).toBe('test-host');
    expect(config.database.port).toBe(5433);
    expect(config.database.name).toBe('test_db');
    expect(config.embeddings.provider).toBe('jina');
    expect(config.embeddings.jina?.apiKey).toBe('test-key');
  });

  it('подставляет переменные окружения из YAML', async () => {
    process.env['RAG_TEST_API_KEY'] = 'secret-api-key';
    process.env['RAG_TEST_DB_PASS'] = 'db-password';

    const configData = {
      database: {
        password: '${RAG_TEST_DB_PASS}',
      },
      embeddings: {
        provider: 'jina',
        jina: {
          apiKey: '${RAG_TEST_API_KEY}',
        },
      },
    };

    const configPath = join(TEST_DIR, 'env-config.yaml');
    await writeFile(configPath, stringifyYaml(configData));

    const config = await loadConfig(configPath);

    expect(config.database.password).toBe('db-password');
    expect(config.embeddings.jina?.apiKey).toBe('secret-api-key');

    delete process.env['RAG_TEST_API_KEY'];
    delete process.env['RAG_TEST_DB_PASS'];
  });

  it('применяет дефолтные значения для отсутствующих полей', async () => {
    // Минимальный конфиг — только database.host.
    const configData = {
      database: {
        host: 'partial-host',
      },
    };

    const configPath = join(TEST_DIR, 'partial-config.yaml');
    await writeFile(configPath, stringifyYaml(configData));

    const config = await loadConfig(configPath);

    // Указанное значение.
    expect(config.database.host).toBe('partial-host');
    // Дефолтные значения.
    expect(config.database.port).toBe(5432);
    expect(config.database.name).toBe('local_rag');
    expect(config.database.user).toBe('rag');
    expect(config.search.bm25Weight).toBe(0.4);
    expect(config.search.vectorWeight).toBe(0.6);
    expect(config.reranker.provider).toBe('none');
    expect(config.indexing.chunkSize.maxTokens).toBe(1000);
  });

  it('выбрасывает ошибку, если явный configPath не найден', async () => {
    await expect(loadConfig(join(TEST_DIR, 'nonexistent.yaml')))
      .rejects.toThrow('Config file not found at path:');
  });

  it('выбрасывает ошибку при невалидном конфиге', async () => {
    const configData = {
      embeddings: {
        provider: 'invalid-provider',
      },
    };

    const configPath = join(TEST_DIR, 'invalid-config.yaml');
    await writeFile(configPath, stringifyYaml(configData));

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it('корректно обрабатывает sources из YAML', async () => {
    const configData = {
      sources: [
        {
          name: 'test-source',
          type: 'local',
          path: '/tmp/test',
          include: ['**/*.ts', '**/*.js'],
          exclude: ['node_modules/**'],
        },
      ],
    };

    const configPath = join(TEST_DIR, 'sources-config.yaml');
    await writeFile(configPath, stringifyYaml(configData));

    const config = await loadConfig(configPath);

    expect(config.sources).toHaveLength(1);
    expect(config.sources[0]!.name).toBe('test-source');
    expect(config.sources[0]!.include).toEqual(['**/*.ts', '**/*.js']);
    expect(config.sources[0]!.exclude).toEqual(['node_modules/**']);
  });

  it('переопределяет search-параметры из конфига', async () => {
    const configData = {
      search: {
        bm25Weight: 0.5,
        vectorWeight: 0.5,
        retrieveTopK: 100,
        finalTopK: 20,
        rrf: {
          k: 80,
        },
      },
    };

    const configPath = join(TEST_DIR, 'search-config.yaml');
    await writeFile(configPath, stringifyYaml(configData));

    const config = await loadConfig(configPath);

    expect(config.search.bm25Weight).toBe(0.5);
    expect(config.search.vectorWeight).toBe(0.5);
    expect(config.search.retrieveTopK).toBe(100);
    expect(config.search.finalTopK).toBe(20);
    expect(config.search.rrf.k).toBe(80);
  });
});

// --- RAG_CONFIG env var ---

describe('RAG_CONFIG env var', () => {
  const originalEnv = process.env['RAG_CONFIG'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['RAG_CONFIG'];
    } else {
      process.env['RAG_CONFIG'] = originalEnv;
    }
  });

  it('загружает конфиг из пути, указанного в RAG_CONFIG', async () => {
    const configData = {
      database: {
        host: 'env-host',
        port: 5555,
      },
    };
    const configPath = join(TEST_DIR, 'env-rag-config.yaml');
    await writeFile(configPath, stringifyYaml(configData));

    process.env['RAG_CONFIG'] = configPath;

    const config = await loadConfig();

    expect(config.database.host).toBe('env-host');
    expect(config.database.port).toBe(5555);
  });

  it('выбрасывает ошибку, если RAG_CONFIG указывает на несуществующий файл', async () => {
    process.env['RAG_CONFIG'] = join(TEST_DIR, 'missing-env-config.yaml');

    await expect(loadConfig())
      .rejects.toThrow('Config file not found at RAG_CONFIG path:');
  });

  it('не выбрасывает ошибку при отсутствии RAG_CONFIG, использует fallback', async () => {
    delete process.env['RAG_CONFIG'];

    // Без RAG_CONFIG loadConfig() должен использовать обычный fallback (CWD/global/дефолты).
    // Проверяем что ошибка не выбрасывается и возвращается валидный конфиг.
    await expect(loadConfig()).resolves.toBeDefined();
  });

  it('RAG_CONFIG имеет приоритет над CWD', async () => {
    // Создаём два файла: один с host='cwd-host' в TEST_DIR, другой с host='env-host'.
    const cwdConfig = { database: { host: 'cwd-host' } };
    const envConfig = { database: { host: 'env-host' } };

    const cwdConfigPath = join(TEST_DIR, 'rag.config.yaml');
    const envConfigPath = join(TEST_DIR, 'env-override.yaml');

    await writeFile(cwdConfigPath, stringifyYaml(cwdConfig));
    await writeFile(envConfigPath, stringifyYaml(envConfig));

    process.env['RAG_CONFIG'] = envConfigPath;

    // Меняем CWD на TEST_DIR, чтобы rag.config.yaml из CWD был доступен.
    const originalCwd = process.cwd();
    process.chdir(TEST_DIR);

    try {
      const config = await loadConfig();
      // Должен загрузиться конфиг из RAG_CONFIG, не из CWD.
      expect(config.database.host).toBe('env-host');
    } finally {
      process.chdir(originalCwd);
    }
  });
});
