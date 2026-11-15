/**
 * Builds the free cloud version for Vercel, using Vercel's Build Output API (.vercel/output):
 * - the 3D client as static files,
 * - three small serverless functions, each bundled into one file: /api/town, /api/mind and /api/health.
 *
 * Vercel runs this as the build command (see vercel.json). Locally: `pnpm build:vercel`, then
 * `pnpm serve:vercel` to try it against a local Postgres.
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel/output');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'static'), { recursive: true });

console.log('Building the 3D client…');
execSync('pnpm --filter @agentville/client build', { cwd: root, stdio: 'inherit' });
cpSync(join(root, 'apps/client/dist'), join(out, 'static'), { recursive: true });

const functions = { town: 'townHandler', mind: 'mindHandler', health: 'healthHandler' };
for (const [name, handler] of Object.entries(functions)) {
  console.log(`Bundling /api/${name}…`);
  const dir = join(out, 'functions/api', `${name}.func`);
  mkdirSync(dir, { recursive: true });
  await build({
    stdin: {
      contents: `import { ${handler} } from './apps/server/src/cloud/api';\nmodule.exports = ${handler}();`,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: join(dir, 'index.js'),
    // pg can use a native driver if one is installed; we never do.
    external: ['pg-native'],
    logLevel: 'warning',
  });
  writeFileSync(
    join(dir, '.vc-config.json'),
    JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2),
  );
}

writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/assets/(.*)', headers: { 'cache-control': 'public, max-age=86400' }, continue: true },
        { handle: 'filesystem' },
        { src: '/api/(.*)', status: 404, dest: '/404' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log(`Done: ${out}`);
