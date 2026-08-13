import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

export const DEFAULT_DATA_DIRECTORY = 'D:\\路径卷不可删\\test-management-platform';

/** Local-only storage root. The application may create children, never delete this root. */
export function dataDirectory(environment = process.env): string {
  return environment.TEST_MANAGEMENT_DATA_DIR || DEFAULT_DATA_DIRECTORY;
}

export function databasePath(environment = process.env): string {
  const root = runtimeRoot(environment);
  const result = resolve(root, 'data', 'test-management.sqlite');
  if (relative(resolve(root), result).startsWith('..') || !isAbsolute(result)) throw new Error('database path escapes configured root');
  return normalize(result);
}

export function evidenceDirectory(environment = process.env): string {
  return containedPath(['evidence'], environment);
}

export function evidencePath(fileName: string, environment = process.env): string {
  if (!fileName || fileName.includes('..') || fileName.includes(':') || /[\\/]/.test(fileName)) throw new Error('evidence file name must be local');
  return containedPath(['evidence', fileName], environment);
}

export function runtimeRoot(environment = process.env): string {
  const root = dataDirectory(environment);
  if (root.split(/[\\/]/).includes('..')) throw new Error('TEST_MANAGEMENT_DATA_DIR must not contain traversal');
  return resolve(root);
}

function containedPath(parts: string[], environment: NodeJS.ProcessEnv): string {
  const root = runtimeRoot(environment);
  const result = resolve(root, ...parts);
  if (relative(root, result).startsWith('..') || !isAbsolute(result)) throw new Error('runtime path escapes configured root');
  return normalize(result);
}
