// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SyntaxNode = any;

// Типы семантических узлов.
export type FragmentType = 'CLASS' | 'INTERFACE' | 'FUNCTION' | 'METHOD' | 'ENUM' | 'TYPE';

// Тип функции-экстрактора узлов из AST.
export type ExtractorFn = (rootNode: SyntaxNode) => ExtractedNode[];

// Извлечённый семантический узел AST.
export interface ExtractedNode {
  // Тип фрагмента кода.
  fragmentType: FragmentType;
  // Полное квалифицированное имя (ClassName.methodName или просто name).
  fqn: string;
  // Начальная строка (1-based).
  startLine: number;
  // Конечная строка (1-based).
  endLine: number;
  // Текстовое содержимое узла.
  text: string;
  // Расширенный подтип фрагмента (DATA_CLASS, SEALED_CLASS, RECORD и т.д.).
  fragmentSubtype?: string;
  // Тип receiver для Kotlin extension functions.
  receiverType?: string;
}

// Возвращает первое именованное дочернее поле или дочерний узел по типу.
export function getNameNode(node: SyntaxNode): SyntaxNode | null {
  return node.childForFieldName('name') ?? null;
}

// Извлекает имя из узла объявления.
export function extractName(node: SyntaxNode): string | null {
  const nameNode = getNameNode(node);
  return nameNode ? nameNode.text : null;
}

// Конвертирует строку tree-sitter (0-based) в 1-based.
export function toLine(row: number): number {
  return row + 1;
}

// Собирает leading-аннотации перед узлом (для Java/Kotlin).
// Возвращает строку начала первой аннотации (1-based) или startLine узла если аннотаций нет.
export function captureLeadingAnnotations(node: SyntaxNode): number {
  let firstAnnotationLine = toLine(node.startPosition.row);
  const parent = node.parent;
  if (!parent) {
    return firstAnnotationLine;
  }

  // Ищем аннотации среди предшествующих сиблингов.
  const siblings = parent.children as SyntaxNode[];
  const nodeIndex = siblings.indexOf(node);
  for (let i = nodeIndex - 1; i >= 0; i--) {
    const sibling = siblings[i];
    if (sibling.type === 'annotation' || sibling.type === 'marker_annotation') {
      firstAnnotationLine = toLine(sibling.startPosition.row);
    } else {
      break;
    }
  }

  return firstAnnotationLine;
}
