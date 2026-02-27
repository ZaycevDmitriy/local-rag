import { describe, it, expect } from 'vitest';
import { parseStatements } from '../importer.js';

describe('importer', () => {
  describe('parseStatements', () => {
    it('парсит одиночный стейтмент', () => {
      const sql = 'INSERT INTO sources (id) VALUES (\'abc\');';
      const result = parseStatements(sql);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(sql);
    });

    it('парсит несколько стейтментов', () => {
      const sql = [
        'INSERT INTO sources (id) VALUES (\'a\');',
        'INSERT INTO chunks (id) VALUES (\'b\');',
      ].join('\n');
      const result = parseStatements(sql);
      expect(result).toHaveLength(2);
    });

    it('пропускает комментарии', () => {
      const sql = [
        '-- Source: test',
        '-- Exported: 2026-02-27',
        '',
        'INSERT INTO sources (id) VALUES (\'a\');',
      ].join('\n');
      const result = parseStatements(sql);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('INSERT INTO sources');
    });

    it('пропускает пустые строки', () => {
      const sql = [
        '',
        'INSERT INTO sources (id) VALUES (\'a\');',
        '',
        '',
        'INSERT INTO chunks (id) VALUES (\'b\');',
        '',
      ].join('\n');
      const result = parseStatements(sql);
      expect(result).toHaveLength(2);
    });

    it('обрабатывает многострочный стейтмент', () => {
      const sql = [
        'INSERT INTO chunks (id, content)',
        'VALUES (\'x\',',
        '\'long content\');',
      ].join('\n');
      const result = parseStatements(sql);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('INSERT INTO chunks');
      expect(result[0]).toContain('long content');
    });

    it('возвращает пустой массив для пустого файла', () => {
      expect(parseStatements('')).toEqual([]);
      expect(parseStatements('-- comment only\n')).toEqual([]);
    });

    it('обрабатывает контент с кавычками', () => {
      const sql = 'INSERT INTO chunks (content) VALUES (\'it\'\'s a test\');';
      const result = parseStatements(sql);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('it\'\'s');
    });
  });
});
