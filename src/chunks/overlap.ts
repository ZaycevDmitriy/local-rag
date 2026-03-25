// Результат вычисления overlap.
export interface OverlapResult {
  overlapLines: string[];
  overlapLength: number;
}

// Вычисляет строки для overlap из конца текущего чанка.
// Обходит строки с конца, накапливая до overlapChars символов.
export function computeOverlap(lines: string[], overlapChars: number): OverlapResult {
  const overlapLines: string[] = [];
  let overlapLength = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    const lineLen = line.length + 1; // +1 для \n.
    if (overlapLength + lineLen > overlapChars && overlapLines.length > 0) {
      break;
    }
    overlapLines.unshift(line);
    overlapLength += lineLen;
  }

  return { overlapLines, overlapLength };
}
