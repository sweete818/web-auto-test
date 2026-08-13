import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const mode = process.argv[2];
if (!['test', 'typecheck'].includes(mode)) throw new Error('Expected test or typecheck');

const node = process.execPath;
const root = process.cwd();
const argumentsByMode = mode === 'test'
  ? [join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'packages/contracts/test', 'packages/database/test']
  : [join(root, 'node_modules', 'typescript', 'lib', 'tsc.js'), '-p', 'tsconfig.json', '--noEmit'];
const result = spawnSync(node, argumentsByMode, {
  stdio: 'inherit',
  env: { ...process.env, CI: 'true' },
});
process.exit(result.status ?? 1);
