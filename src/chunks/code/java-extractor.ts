import type { ExtractedNode, FragmentType, SyntaxNode } from './extractor-types.js';
import { captureLeadingAnnotations, extractName, toLine } from './extractor-types.js';

// Типы комментариев, которые могут предшествовать объявлению (Javadoc, inline).
const JAVA_COMMENT_TYPES = ['block_comment', 'line_comment'];

// Извлекает семантические узлы из Java AST.
export function extractNodes(rootNode: SyntaxNode): ExtractedNode[] {
  const result: ExtractedNode[] = [];
  const sourceLines = rootNode.text.split('\n');
  const packageName = extractPackage(rootNode);

  for (const child of rootNode.children) {
    visitNode(child, result, packageName, [], sourceLines);
  }

  return result;
}

// Извлекает имя пакета из корня AST.
function extractPackage(rootNode: SyntaxNode): string | null {
  for (const child of rootNode.children) {
    if (child.type === 'package_declaration') {
      // Ищем scoped_identifier или identifier с именем пакета.
      for (const c of child.children) {
        if (c.type === 'scoped_identifier' || c.type === 'identifier') {
          return c.text;
        }
      }
    }
  }
  return null;
}

// Строит FQN из пакета, стека классов и имени.
function buildFqn(packageName: string | null, classStack: string[], name: string): string {
  return [...(packageName ? [packageName] : []), ...classStack, name].join('.');
}

// Строит ExtractedNode с текстом, включающим leading Javadoc/комментарии.
function buildExtractedNode(
  node: SyntaxNode,
  fqn: string,
  fragmentType: FragmentType,
  subtype: string | undefined,
  sourceLines: string[],
): ExtractedNode {
  const capturedStartLine = captureLeadingAnnotations(node, undefined, JAVA_COMMENT_TYPES);
  const endLine = toLine(node.endPosition.row);
  // Извлекаем текст с учётом Javadoc-строк, которые предшествуют узлу как siblings.
  const text = sourceLines.slice(capturedStartLine - 1, endLine).join('\n');

  return {
    fragmentType,
    fqn,
    startLine: capturedStartLine,
    endLine,
    text,
    ...(subtype && { fragmentSubtype: subtype }),
  };
}

// Рекурсивно обходит AST-узел.
function visitNode(
  node: SyntaxNode,
  result: ExtractedNode[],
  packageName: string | null,
  classStack: string[],
  sourceLines: string[],
): void {
  switch (node.type) {
  case 'class_declaration':
    handleTypeDecl(node, result, packageName, classStack, 'CLASS', undefined, sourceLines, true);
    return;
  case 'record_declaration':
    handleTypeDecl(node, result, packageName, classStack, 'CLASS', 'RECORD', sourceLines, false);
    return;
  case 'interface_declaration':
    handleTypeDecl(node, result, packageName, classStack, 'INTERFACE', undefined, sourceLines, false);
    return;
  case 'annotation_type_declaration':
    handleTypeDecl(node, result, packageName, classStack, 'INTERFACE', 'ANNOTATION_TYPE', sourceLines, false);
    return;
  case 'enum_declaration':
    handleTypeDecl(node, result, packageName, classStack, 'ENUM', undefined, sourceLines, false);
    return;
  case 'method_declaration':
    if (classStack.length > 0) {
      handleMethodDecl(node, result, packageName, classStack, undefined, sourceLines);
    }
    return;
  case 'constructor_declaration':
    if (classStack.length > 0) {
      handleMethodDecl(node, result, packageName, classStack, 'CONSTRUCTOR', sourceLines);
    }
    return;
  default:
    // Обходим children для program, class_body и прочих контейнеров.
    for (const child of node.children) {
      visitNode(child, result, packageName, classStack, sourceLines);
    }
  }
}

// Обрабатывает объявление типа: class, record, interface, annotation type, enum.
// Только top-level типы (classStack пустой) эмитируют отдельный чанк.
// class_declaration с recurse=true рекурсивно обходит тело для извлечения методов.
function handleTypeDecl(
  node: SyntaxNode,
  result: ExtractedNode[],
  packageName: string | null,
  classStack: string[],
  fragmentType: FragmentType,
  subtype: string | undefined,
  sourceLines: string[],
  recurse: boolean,
): void {
  const name = extractName(node);
  if (!name) {
    return;
  }

  const fqn = buildFqn(packageName, classStack, name);

  // Только верхнеуровневые типы эмитируют чанк.
  if (classStack.length === 0) {
    result.push(buildExtractedNode(node, fqn, fragmentType, subtype, sourceLines));
  }

  if (recurse) {
    // Рекурсивно обходим тело класса для извлечения методов с обновлённым classStack.
    const body = node.childForFieldName('body');
    if (body) {
      const newClassStack = [...classStack, name];
      for (const child of body.children) {
        visitNode(child, result, packageName, newClassStack, sourceLines);
      }
    }
  }
}

// Обрабатывает объявление метода или конструктора.
function handleMethodDecl(
  node: SyntaxNode,
  result: ExtractedNode[],
  packageName: string | null,
  classStack: string[],
  subtype: string | undefined,
  sourceLines: string[],
): void {
  const name = extractName(node);
  if (!name) {
    return;
  }

  const fqn = buildFqn(packageName, classStack, name);
  result.push(buildExtractedNode(node, fqn, 'METHOD', subtype, sourceLines));
}
