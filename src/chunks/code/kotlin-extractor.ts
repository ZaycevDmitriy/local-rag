import type { ExtractedNode, FragmentType, SyntaxNode } from './extractor-types.js';
import { captureLeadingAnnotations, toLine } from './extractor-types.js';

// Типы комментариев KDoc и inline-комментариев в Kotlin.
const KOTLIN_COMMENT_TYPES = ['multiline_comment', 'line_comment'];

// Извлекает семантические узлы из Kotlin AST.
export function extractNodes(rootNode: SyntaxNode): ExtractedNode[] {
  const result: ExtractedNode[] = [];
  const sourceLines = rootNode.text.split('\n');
  const packageName = extractPackage(rootNode);

  for (const child of rootNode.children) {
    visitNode(child, result, packageName, [], sourceLines);
  }

  // Группируем top-level properties отдельным проходом.
  const propGroups = groupTopLevelProperties(rootNode, packageName, sourceLines);
  result.push(...propGroups);

  return result;
}

// Извлекает имя пакета из корня AST.
function extractPackage(rootNode: SyntaxNode): string | null {
  for (const child of rootNode.children) {
    if (child.type === 'package_header') {
      // Kotlin: package_header содержит identifier с полным именем пакета.
      const identifier = child.children.find((c: SyntaxNode) => c.type === 'identifier');
      return identifier ? identifier.text : null;
    }
  }
  return null;
}

// Строит FQN из пакета, стека классов и имени.
function buildFqn(packageName: string | null, classStack: string[], name: string): string {
  return [...(packageName ? [packageName] : []), ...classStack, name].join('.');
}

// Строит ExtractedNode с текстом, включающим ведущий KDoc/комментарии.
function buildExtractedNode(
  node: SyntaxNode,
  fqn: string,
  fragmentType: FragmentType,
  subtype: string | undefined,
  receiverType: string | undefined,
  sourceLines: string[],
): ExtractedNode {
  // Kotlin: аннотации внутри modifiers (не siblings), только KDoc/комментарии — siblings.
  const capturedStartLine = captureLeadingAnnotations(node, ['annotation'], KOTLIN_COMMENT_TYPES);
  const endLine = toLine(node.endPosition.row);
  const text = sourceLines.slice(capturedStartLine - 1, endLine).join('\n');

  return {
    fragmentType,
    fqn,
    startLine: capturedStartLine,
    endLine,
    text,
    ...(subtype && { fragmentSubtype: subtype }),
    ...(receiverType && { receiverType }),
  };
}

// Возвращает имя класса/объекта через type_identifier дочерний узел.
// Kotlin не использует childForFieldName('name') для классов.
function getKotlinClassName(node: SyntaxNode): string | null {
  const nameNode = node.children.find((c: SyntaxNode) => c.type === 'type_identifier');
  return nameNode ? nameNode.text : null;
}

// Возвращает имя и receiver type для function_declaration.
// Extension function: user_type . simple_identifier
// Regular function: simple_identifier
function getFunctionName(node: SyntaxNode): { name: string | null; receiverType: string | null } {
  let receiverCandidate: SyntaxNode | null = null;
  let foundDot = false;

  for (const child of node.children) {
    if (child.type === 'user_type' && !receiverCandidate) {
      receiverCandidate = child;
    } else if (child.type === '.' && receiverCandidate) {
      foundDot = true;
    } else if (child.type === 'simple_identifier') {
      return {
        name: child.text,
        receiverType: foundDot ? receiverCandidate!.text : null,
      };
    }
  }
  return { name: null, receiverType: null };
}

// Проверяет наличие class_modifier с заданным именем в modifiers ноды.
function hasClassModifier(node: SyntaxNode, modifierName: string): boolean {
  const modifiers = node.children.find((c: SyntaxNode) => c.type === 'modifiers');
  if (!modifiers) return false;
  return modifiers.children.some((cm: SyntaxNode) =>
    cm.type === 'class_modifier' &&
    cm.children.some((c: SyntaxNode) => c.type === modifierName),
  );
}

// Возвращает тело класса/объекта (class_body или enum_class_body).
// Kotlin не использует childForFieldName('body') для классов.
function getClassBody(node: SyntaxNode): SyntaxNode | null {
  return node.children.find(
    (c: SyntaxNode) => c.type === 'class_body' || c.type === 'enum_class_body',
  ) ?? null;
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
    handleClassDecl(node, result, packageName, classStack, sourceLines);
    return;
  case 'object_declaration':
    handleObjectDecl(node, result, packageName, classStack, sourceLines);
    return;
  case 'companion_object':
    handleCompanionObject(node, result, packageName, classStack, sourceLines);
    return;
  case 'function_declaration':
    handleFunctionDecl(node, result, packageName, classStack, sourceLines);
    return;
  case 'property_declaration':
    // Top-level properties группируются отдельно в groupTopLevelProperties.
    return;
  default:
    for (const child of node.children) {
      visitNode(child, result, packageName, classStack, sourceLines);
    }
  }
}

// Обрабатывает class_declaration: class, data class, sealed class, enum class, interface.
// Только top-level (classStack пустой) эмитируют отдельный чанк.
function handleClassDecl(
  node: SyntaxNode,
  result: ExtractedNode[],
  packageName: string | null,
  classStack: string[],
  sourceLines: string[],
): void {
  const name = getKotlinClassName(node);
  if (!name) return;

  const fqn = buildFqn(packageName, classStack, name);

  // Определяем тип фрагмента по ключевым словам и модификаторам.
  const isEnum = node.children.some((c: SyntaxNode) => c.type === 'enum');
  const isInterface = node.children.some((c: SyntaxNode) => c.type === 'interface');
  const isData = hasClassModifier(node, 'data');
  const isSealed = hasClassModifier(node, 'sealed');

  let fragmentType: FragmentType;
  let subtype: string | undefined;

  if (isEnum) {
    fragmentType = 'ENUM';
  } else if (isInterface) {
    fragmentType = 'INTERFACE';
  } else if (isData) {
    fragmentType = 'CLASS';
    subtype = 'DATA_CLASS';
  } else if (isSealed) {
    fragmentType = 'CLASS';
    subtype = 'SEALED_CLASS';
  } else {
    fragmentType = 'CLASS';
  }

  // Только верхнеуровневые типы эмитируют чанк.
  if (classStack.length === 0) {
    result.push(buildExtractedNode(node, fqn, fragmentType, subtype, undefined, sourceLines));
  }

  // Рекурсивно обходим тело класса для извлечения методов.
  const body = getClassBody(node);
  if (body) {
    const newClassStack = [...classStack, name];
    for (const child of body.children) {
      visitNode(child, result, packageName, newClassStack, sourceLines);
    }
  }
}

// Обрабатывает object_declaration: object Singleton { ... }
// Только top-level эмитируют CLASS (OBJECT) чанк.
function handleObjectDecl(
  node: SyntaxNode,
  result: ExtractedNode[],
  packageName: string | null,
  classStack: string[],
  sourceLines: string[],
): void {
  const name = getKotlinClassName(node);
  if (!name) return;

  const fqn = buildFqn(packageName, classStack, name);

  if (classStack.length === 0) {
    result.push(buildExtractedNode(node, fqn, 'CLASS', 'OBJECT', undefined, sourceLines));
  }

  // Обходим методы внутри object.
  const body = getClassBody(node);
  if (body) {
    const newClassStack = [...classStack, name];
    for (const child of body.children) {
      visitNode(child, result, packageName, newClassStack, sourceLines);
    }
  }
}

// Обрабатывает companion_object — всегда эмитирует CLASS (COMPANION_OBJECT) чанк.
// Безымянный companion получает имя 'Companion'.
function handleCompanionObject(
  node: SyntaxNode,
  result: ExtractedNode[],
  packageName: string | null,
  classStack: string[],
  sourceLines: string[],
): void {
  const nameNode = node.children.find((c: SyntaxNode) => c.type === 'type_identifier');
  const companionName = nameNode?.text ?? 'Companion';

  const fqn = buildFqn(packageName, classStack, companionName);
  result.push(buildExtractedNode(node, fqn, 'CLASS', 'COMPANION_OBJECT', undefined, sourceLines));

  // Обходим методы companion object.
  const body = getClassBody(node);
  if (body) {
    const newClassStack = [...classStack, companionName];
    for (const child of body.children) {
      visitNode(child, result, packageName, newClassStack, sourceLines);
    }
  }
}

// Обрабатывает function_declaration: методы, top-level функции, extension functions.
function handleFunctionDecl(
  node: SyntaxNode,
  result: ExtractedNode[],
  packageName: string | null,
  classStack: string[],
  sourceLines: string[],
): void {
  const { name, receiverType } = getFunctionName(node);
  if (!name) return;

  const fqn = buildFqn(packageName, classStack, name);

  if (classStack.length > 0) {
    // Метод класса/объекта.
    result.push(buildExtractedNode(node, fqn, 'METHOD', undefined, undefined, sourceLines));
  } else if (receiverType) {
    // Extension function.
    result.push(buildExtractedNode(node, fqn, 'FUNCTION', 'EXTENSION_FUNCTION', receiverType, sourceLines));
  } else {
    // Обычная top-level функция.
    result.push(buildExtractedNode(node, fqn, 'FUNCTION', undefined, undefined, sourceLines));
  }
}

// Группирует последовательные top-level property_declaration в один чанк.
// fragmentType: FUNCTION, subtype: PROPERTIES (семантически — набор свойств модуля).
function groupTopLevelProperties(
  rootNode: SyntaxNode,
  packageName: string | null,
  sourceLines: string[],
): ExtractedNode[] {
  const result: ExtractedNode[] = [];
  let groupStartRow: number | null = null;
  let groupEndRow: number | null = null;

  const flushGroup = () => {
    if (groupStartRow === null || groupEndRow === null) return;
    const startLine = toLine(groupStartRow);
    const endLine = toLine(groupEndRow);
    const text = sourceLines.slice(startLine - 1, endLine).join('\n');
    const fqn = buildFqn(packageName, [], `_properties_${startLine}`);
    result.push({
      fragmentType: 'FUNCTION',
      fqn,
      startLine,
      endLine,
      text,
      fragmentSubtype: 'PROPERTIES',
    });
    groupStartRow = null;
    groupEndRow = null;
  };

  for (const child of rootNode.children) {
    if (child.type === 'property_declaration') {
      if (groupStartRow === null) groupStartRow = child.startPosition.row;
      groupEndRow = child.endPosition.row;
    } else {
      flushGroup();
    }
  }
  flushGroup();

  return result;
}
