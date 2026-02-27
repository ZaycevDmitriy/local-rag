import { describe, it, expect } from 'vitest';
import { toLine, extractName, getNameNode, captureLeadingAnnotations } from '../extractor-types.js';

describe('toLine', () => {
  it('конвертирует 0-based строку в 1-based', () => {
    expect(toLine(0)).toBe(1);
    expect(toLine(9)).toBe(10);
    expect(toLine(99)).toBe(100);
  });
});

describe('getNameNode', () => {
  it('возвращает именованное дочернее поле name', () => {
    const nameNode = { text: 'MyClass' };
    const node = { childForFieldName: (field: string) => field === 'name' ? nameNode : null };
    expect(getNameNode(node)).toBe(nameNode);
  });

  it('возвращает null если поле name отсутствует', () => {
    const node = { childForFieldName: () => null };
    expect(getNameNode(node)).toBeNull();
  });
});

describe('extractName', () => {
  it('извлекает текст из поля name', () => {
    const node = { childForFieldName: (field: string) => field === 'name' ? { text: 'myFunc' } : null };
    expect(extractName(node)).toBe('myFunc');
  });

  it('возвращает null если имя отсутствует', () => {
    const node = { childForFieldName: () => null };
    expect(extractName(node)).toBeNull();
  });
});

describe('captureLeadingAnnotations', () => {
  it('возвращает startLine узла если нет родителя', () => {
    const node = {
      startPosition: { row: 4 },
      parent: null,
      children: [],
    };
    expect(captureLeadingAnnotations(node)).toBe(5);
  });

  it('возвращает startLine узла если нет предшествующих аннотаций', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node: any = {
      startPosition: { row: 3 },
      parent: null,
      children: [],
    };
    const parent = {
      children: [{ type: 'comment', startPosition: { row: 1 } }, node],
    };
    node.parent = parent;
    expect(captureLeadingAnnotations(node)).toBe(4);
  });

  it('возвращает строку первой аннотации если есть @annotation', () => {
    const annotationNode = { type: 'annotation', startPosition: { row: 2 } };
    const classNode = {
      startPosition: { row: 3 },
      parent: null as unknown as object,
      children: [],
    };
    const parent = { children: [annotationNode, classNode] };
    classNode.parent = parent;
    expect(captureLeadingAnnotations(classNode)).toBe(3);
  });

  it('возвращает строку marker_annotation', () => {
    const annotationNode = { type: 'marker_annotation', startPosition: { row: 5 } };
    const classNode = {
      startPosition: { row: 6 },
      parent: null as unknown as object,
      children: [],
    };
    const parent = { children: [annotationNode, classNode] };
    classNode.parent = parent;
    expect(captureLeadingAnnotations(classNode)).toBe(6);
  });

  it('останавливает цепочку аннотаций при не-аннотационном сиблинге', () => {
    const otherNode = { type: 'field_declaration', startPosition: { row: 0 } };
    const annotationNode = { type: 'annotation', startPosition: { row: 1 } };
    const methodNode = {
      startPosition: { row: 2 },
      parent: null as unknown as object,
      children: [],
    };
    const parent = { children: [otherNode, annotationNode, methodNode] };
    methodNode.parent = parent;
    // annotationNode идёт сразу перед methodNode — строка 1+1 = 2.
    expect(captureLeadingAnnotations(methodNode)).toBe(2);
  });
});
