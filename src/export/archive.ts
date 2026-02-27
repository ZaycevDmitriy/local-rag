// Упаковка/распаковка tar.gz архивов.
import * as tar from 'tar';

// Упаковывает директорию в .tar.gz (или .tar если compress=false).
export async function packArchive(
  sourceDir: string,
  outputPath: string,
  compress: boolean,
): Promise<void> {
  await tar.create(
    {
      gzip: compress,
      file: outputPath,
      cwd: sourceDir,
    },
    ['.'],
  );
}

// Распаковывает архив в целевую директорию.
export async function unpackArchive(
  archivePath: string,
  targetDir: string,
): Promise<void> {
  await tar.extract({
    file: archivePath,
    cwd: targetDir,
  });
}
