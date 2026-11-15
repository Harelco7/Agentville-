/** Raw bytes of the binary assets, fetched from public/. See assetSource.artifact.ts for the hosted preview build. */
const base = import.meta.env.BASE_URL;

async function bytes(path: string): Promise<ArrayBuffer> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  return res.arrayBuffer();
}

export const hdriBytes = () => bytes('assets/hdri/quarry_01_1k.hdr');
export const modelBytes = () => bytes('assets/models/Xbot.glb');
