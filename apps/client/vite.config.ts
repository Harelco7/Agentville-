import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** `import data from './file.ext?base64'` gives the file's bytes as a base64 string (used by the artifact build). */
function base64(): Plugin {
  return {
    name: 'agentville-base64',
    enforce: 'pre',
    async load(id) {
      if (!id.endsWith('?base64')) return null;
      const { readFile } = await import('node:fs/promises');
      const buf = await readFile(id.slice(0, -'?base64'.length));
      return `export default ${JSON.stringify(buf.toString('base64'))};`;
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), base64()],
  resolve:
    mode === 'artifact'
      ? { alias: [{ find: /^\.\/assetSource$/, replacement: '/src/assetSource.artifact.ts' }] }
      : undefined,
  server: { port: 5173, host: true },
}));
