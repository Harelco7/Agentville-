/**
 * Used instead of assetSource.ts by `pnpm build:artifact`. The hosted preview can't serve
 * .hdr or .glb files, so this build carries both inside the script and decodes them here.
 */
import hdri from '../public/assets/hdri/quarry_01_1k.hdr?base64';
import model from '../public/assets/models/Xbot.glb?base64';

function decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export const hdriBytes = async () => decode(hdri);
export const modelBytes = async () => decode(model);
