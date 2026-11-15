import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** `import url from './file.ext?datauri'` gives the file as a base64 data URL (used by the artifact build). */
function dataUri(): Plugin {
  return {
    name: 'agentville-datauri',
    enforce: 'pre',
    async load(id) {
      if (!id.endsWith('?datauri')) return null;
      const { readFile } = await import('node:fs/promises');
      const buf = await readFile(id.slice(0, -'?datauri'.length));
      return `export default ${JSON.stringify(`data:application/octet-stream;base64,${buf.toString('base64')}`)};`;
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), dataUri()],
  resolve:
    mode === 'artifact'
      ? { alias: [{ find: /^\.\.\/assetUrls$/, replacement: '/src/assetUrls.artifact.ts' }] }
      : undefined,
  server: { port: 5173, host: true },
}));
