import {
  DataTexture,
  EquirectangularReflectionMapping,
  LinearFilter,
  LinearSRGBColorSpace,
  RGBAFormat,
  type Texture,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { hdriBytes, modelBytes } from './assetSource';

/** Loads each asset once and suspends React until it is ready. Parsing from bytes works the same in every build. */
type Entry = { promise: Promise<void>; value?: unknown; error?: unknown };
const cache = new Map<string, Entry>();

function suspend<T>(key: string, load: () => Promise<T>): T {
  let entry = cache.get(key);
  if (!entry) {
    const e: Entry = { promise: Promise.resolve() };
    e.promise = load().then(
      (v) => void (e.value = v),
      (err) => void (e.error = err),
    );
    cache.set(key, e);
    entry = e;
  }
  if (entry.error) throw entry.error;
  if (entry.value === undefined) throw entry.promise;
  return entry.value as T;
}

const loadModel = async (): Promise<GLTF> => new GLTFLoader().parseAsync(await modelBytes(), '');

const loadHdri = async (): Promise<Texture> => {
  const d = new RGBELoader().parse(await hdriBytes());
  const tex = new DataTexture(d.data, d.width, d.height, RGBAFormat, d.type);
  tex.colorSpace = LinearSRGBColorSpace;
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.mapping = EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
};

/** The character model with its animation clips. */
export const useModel = () => suspend('model', loadModel);
/** The sky image used for image-based lighting. */
export const useHdri = () => suspend('hdri', loadHdri);
