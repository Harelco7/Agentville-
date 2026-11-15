// Turns dist-artifact/index.html into one page with its script and styles inline, for the hosted preview.
// Textures stay as separate .jpg files next to the page.
import { readFile, writeFile, rm } from 'node:fs/promises';

const dir = new URL('../dist-artifact/', import.meta.url);
let html = await readFile(new URL('index.html', dir), 'utf8');

const js = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/);
const css = html.match(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/);
if (!js || !css) throw new Error('Unexpected index.html layout');

const code = (await readFile(new URL(js[1], dir), 'utf8')).replace(/<\/script/gi, '<\\/script');
const style = await readFile(new URL(css[1], dir), 'utf8');
const title = html.match(/<title>.*<\/title>/)[0];
const fonts = [...html.matchAll(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts[^>]+>/g)].map((m) => m[0]);

const page = [title, ...fonts, `<style>${style}</style>`, '<div id="root"></div>', `<script type="module">${code}</script>`, ''].join('\n');
await writeFile(new URL('index.html', dir), page);
await rm(new URL(js[1], dir));
await rm(new URL(css[1], dir));
await rm(new URL('assets/hdri', dir), { recursive: true, force: true });
await rm(new URL('assets/models', dir), { recursive: true, force: true });
console.log(`index.html: ${(page.length / 1e6).toFixed(1)} MB`);
