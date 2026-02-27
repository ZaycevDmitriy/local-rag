import type { SyntaxNode, FragmentType, ExtractedNode } from './extractor-types.js';
import { extractName, toLine } from './extractor-types.js';

export type { FragmentType, ExtractedNode };

// Рекурсивно обходит AST и собирает семантические узлы.
export function extractNodes(rootNode: SyntaxNode): ExtractedNode[] {
  const nodes: ExtractedNode[] = [];
  visitNode(rootNode, nodes, null);
  return nodes;
}

function visitNode(node: SyntaxNode, result: ExtractedNode[], currentClassName: string | null): void {
  switch (node.type) {
  case 'class_declaration': {
    const name = extractName(node);
    if (name) {
      result.push({
        fragmentType: 'CLASS',
        fqn: name,
        startLine: toLine(node.startPosition.row),
        endLine: toLine(node.endPosition.row),
        text: node.text,
      });
      // Обходим тело класса с именем класса в контексте.
      const body = node.childForFieldName('body');
      if (body) {
        for (const child of body.children) {
          visitNode(child, result, name);
        }
      }
    }
    return;
  }

  case 'interface_declaration': {
    const name = extractName(node);
    if (name) {
      result.push({
        fragmentType: 'INTERFACE',
        fqn: name,
        startLine: toLine(node.startPosition.row),
        endLine: toLine(node.endPosition.row),
        text: node.text,
      });
    }
    return;
  }

  case 'function_declaration': {
    const name = extractName(node);
    if (name) {
      result.push({
        fragmentType: 'FUNCTION',
        fqn: currentClassName ? `${currentClassName}.${name}` : name,
        startLine: toLine(node.startPosition.row),
        endLine: toLine(node.endPosition.row),
        text: node.text,
      });
    }
    return;
  }

  case 'method_definition': {
    const name = extractName(node);
    if (name && currentClassName) {
      result.push({
        fragmentType: 'METHOD',
        fqn: `${currentClassName}.${name}`,
        startLine: toLine(node.startPosition.row),
        endLine: toLine(node.endPosition.row),
        text: node.text,
      });
    }
    return;
  }

  case 'enum_declaration': {
    const name = extractName(node);
    if (name) {
      result.push({
        fragmentType: 'ENUM',
        fqn: name,
        startLine: toLine(node.startPosition.row),
        endLine: toLine(node.endPosition.row),
        text: node.text,
      });
    }
    return;
  }

  case 'type_alias_declaration': {
    // Экспортируемые type alias.
    const isExported = node.parent?.type === 'export_statement';
    if (isExported) {
      const name = extractName(node);
      if (name) {
        result.push({
          fragmentType: 'TYPE',
          fqn: name,
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
          text: node.text,
        });
      }
    }
    return;
  }

  case 'export_statement': {
    // Обрабатываем содержимое export statement.
    for (const child of node.children) {
      if (child.type !== 'export') {
        visitNode(child, result, currentClassName);
      }
    }
    // Отдельно ищем export const arrow functions.
    checkExportConstArrow(node, result, currentClassName);
    return;
  }

  case 'lexical_declaration': {
    // export const myFunc = () => {} — на верхнем уровне.
    checkLexicalDeclarationForArrow(node, result, currentClassName);
    return;
  }

  default: {
    // Продолжаем обход для верхнего уровня (program / module).
    if (node.type === 'program' || node.type === 'module' || node.type === 'statement_block') {
      for (const child of node.children) {
        visitNode(child, result, currentClassName);
      }
    }
    return;
  }
  }
}

// Проверяет export const name = () => {}.
function checkExportConstArrow(exportNode: SyntaxNode, result: ExtractedNode[], currentClassName: string | null): void {
  for (const child of exportNode.children) {
    if (child.type === 'lexical_declaration') {
      checkLexicalDeclarationForArrow(child, result, currentClassName);
    }
  }
}

// Проверяет const name = () => {} в lexical_declaration.
function checkLexicalDeclarationForArrow(node: SyntaxNode, result: ExtractedNode[], currentClassName: string | null): void {
  for (const child of node.children) {
    if (child.type === 'variable_declarator') {
      const nameNode = child.childForFieldName('name');
      const valueNode = child.childForFieldName('value');
      if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function')) {
        result.push({
          fragmentType: 'FUNCTION',
          fqn: currentClassName ? `${currentClassName}.${nameNode.text}` : nameNode.text,
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
          text: node.text,
        });
      }
    }
  }
}
