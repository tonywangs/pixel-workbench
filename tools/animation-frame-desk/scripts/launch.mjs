import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
process.chdir(new URL('../', import.meta.url));
if (!existsSync('node_modules/sharp')) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
await import('../server.mjs');
