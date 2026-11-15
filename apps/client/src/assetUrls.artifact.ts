/**
 * Used instead of assetUrls.ts by `pnpm build:artifact`. The hosted preview only serves
 * web file types, not .hdr or .glb, so this build inlines both as data URLs.
 */
import hdrInline from '../public/assets/hdri/quarry_01_1k.hdr?datauri';
import modelInline from '../public/assets/models/Xbot.glb?datauri';

// drei picks the HDR loader from a data URL only when its type is application/hdr.
export const HDRI_URL = hdrInline.replace(/^data:[^;,]*/, 'data:application/hdr');
export const MODEL_URL = modelInline;
