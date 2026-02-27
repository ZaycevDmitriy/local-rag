import { describe, it, expect } from 'vitest';
import { escapeValue, generateInsert } from '../exporter.js';

describe('exporter', () => {
  describe('escapeValue', () => {
    it('null → NULL', () => {
      expect(escapeValue(null)).toBe('NULL');
    });

    it('undefined → NULL', () => {
      expect(escapeValue(undefined)).toBe('NULL');
    });

    it('число', () => {
      expect(escapeValue(42)).toBe('42');
      expect(escapeValue(0)).toBe('0');
      expect(escapeValue(-1.5)).toBe('-1.5');
    });

    it('boolean', () => {
      expect(escapeValue(true)).toBe('TRUE');
      expect(escapeValue(false)).toBe('FALSE');
    });

    it('строка → E-string', () => {
      expect(escapeValue('hello')).toBe('E\'hello\'');
    });

    it('строка с одинарными кавычками', () => {
      expect(escapeValue('it\'s a test')).toBe('E\'it\'\'s a test\'');
    });

    it('строка с переносами строк → экранирует \\n', () => {
      expect(escapeValue('line1\nline2')).toBe('E\'line1\\nline2\'');
    });

    it('строка с обратными слэшами → экранирует \\\\', () => {
      expect(escapeValue('path\\to\\file')).toBe('E\'path\\\\to\\\\file\'');
    });

    it('строка с табуляцией → экранирует \\t', () => {
      expect(escapeValue('col1\tcol2')).toBe('E\'col1\\tcol2\'');
    });

    it('Date', () => {
      const date = new Date('2026-02-27T12:00:00.000Z');
      expect(escapeValue(date)).toBe('\'2026-02-27T12:00:00.000Z\'');
    });

    it('объект → JSONB', () => {
      const obj = { path: 'src/app.ts', sourceType: 'code' };
      expect(escapeValue(obj)).toBe('\'{"path":"src/app.ts","sourceType":"code"}\'::jsonb');
    });

    it('объект с кавычками → экранирует', () => {
      const obj = { name: 'it\'s' };
      expect(escapeValue(obj)).toBe('\'{"name":"it\'\'s"}\'::jsonb');
    });

    it('массив чисел → vector', () => {
      const vec = [0.1, 0.2, 0.3];
      expect(escapeValue(vec)).toBe('\'[0.1,0.2,0.3]\'::vector');
    });

    it('пустой массив → JSONB (не vector)', () => {
      expect(escapeValue([])).toBe('\'[]\'::jsonb');
    });
  });

  describe('generateInsert', () => {
    it('генерирует валидный INSERT', () => {
      const sql = generateInsert('sources', {
        id: 'abc-123',
        name: 'test',
        type: 'local',
      });
      expect(sql).toBe(
        'INSERT INTO sources (id, name, type) VALUES (E\'abc-123\', E\'test\', E\'local\');',
      );
    });

    it('обрабатывает NULL и числа', () => {
      const sql = generateInsert('sources', {
        id: 'abc',
        path: null,
        chunk_count: 100,
      });
      expect(sql).toBe(
        'INSERT INTO sources (id, path, chunk_count) VALUES (E\'abc\', NULL, 100);',
      );
    });

    it('обрабатывает JSONB metadata', () => {
      const sql = generateInsert('chunks', {
        id: 'x',
        metadata: { path: 'test.ts' },
      });
      expect(sql).toContain('\'::jsonb');
      expect(sql).toContain('"path":"test.ts"');
    });

    it('обрабатывает vector embedding', () => {
      const sql = generateInsert('chunks', {
        id: 'x',
        embedding: [0.1, 0.2],
      });
      expect(sql).toContain('\'[0.1,0.2]\'::vector');
    });
  });
});
