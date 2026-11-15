import { createContext, useContext, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import {
  CanvasTexture,
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three';

const T = '/assets/textures/';

function repeatable<T extends Texture>(tex: T, srgb = false): T {
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** A tiled roof texture drawn on a canvas, so each house can have its own colour. */
function roofTexture(base: string, seed: number): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rows = 8;
  const cols = 6;
  const rowH = size / rows;
  const colW = size / cols;
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const c = new Color(base);
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? colW / 2 : 0;
    for (let k = -1; k < cols + 1; k++) {
      const shade = 0.82 + rand() * 0.3;
      const tile = c.clone().multiplyScalar(shade);
      ctx.fillStyle = `#${tile.getHexString()}`;
      ctx.fillRect(k * colW + offset, r * rowH, colW - 3, rowH);
      // Shadow under each tile row gives the overlap a little depth.
      const grad = ctx.createLinearGradient(0, r * rowH + rowH * 0.7, 0, r * rowH + rowH);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(k * colW + offset, r * rowH, colW - 3, rowH);
    }
  }
  const tex = new CanvasTexture(canvas);
  return repeatable(tex, true);
}

export interface Materials {
  brick: MeshStandardMaterial;
  plaster: MeshStandardMaterial;
  plasterBlue: MeshStandardMaterial;
  wood: MeshStandardMaterial;
  floorWood: MeshStandardMaterial;
  trim: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  concrete: MeshStandardMaterial;
  asphalt: MeshStandardMaterial;
  grass: MeshStandardMaterial;
  leaves: MeshStandardMaterial;
  leavesLight: MeshStandardMaterial;
  bark: MeshStandardMaterial;
  metal: MeshStandardMaterial;
  lampGlow: MeshStandardMaterial;
  paint: MeshStandardMaterial;
  roofRed: MeshStandardMaterial;
  roofSlate: MeshStandardMaterial;
  fabric: (color: string) => MeshStandardMaterial;
}

/** All shared materials. Textures load once and are reused by every house. */
export function useMaterials(): Materials {
  const [brickD, brickB, brickR, woodD, woodB, woodR, rough, disturb, grassD] = useTexture([
    `${T}brick_diffuse.jpg`,
    `${T}brick_bump.jpg`,
    `${T}brick_roughness.jpg`,
    `${T}hardwood2_diffuse.jpg`,
    `${T}hardwood2_bump.jpg`,
    `${T}hardwood2_roughness.jpg`,
    `${T}roughness_map.jpg`,
    `${T}disturb.jpg`,
    `${T}grass.jpg`,
  ]);

  return useMemo(() => {
    repeatable(brickD, true);
    repeatable(brickB);
    repeatable(brickR);
    repeatable(woodD, true);
    repeatable(woodB);
    repeatable(woodR);
    repeatable(rough);
    repeatable(disturb);
    repeatable(grassD, true);
    grassD.repeat.set(140, 140);

    const fabricCache = new Map<string, MeshStandardMaterial>();

    return {
      brick: new MeshStandardMaterial({ map: brickD, bumpMap: brickB, bumpScale: 2, roughnessMap: brickR, roughness: 1 }),
      plaster: new MeshStandardMaterial({ color: '#e9e2d4', roughnessMap: rough, roughness: 0.95, bumpMap: disturb, bumpScale: 0.12 }),
      plasterBlue: new MeshStandardMaterial({ color: '#c9d6de', roughnessMap: rough, roughness: 0.95, bumpMap: disturb, bumpScale: 0.12 }),
      wood: new MeshStandardMaterial({ map: woodD, bumpMap: woodB, bumpScale: 1, roughnessMap: woodR, color: '#b88a5c' }),
      floorWood: new MeshStandardMaterial({ map: woodD, bumpMap: woodB, bumpScale: 0.6, roughnessMap: woodR }),
      trim: new MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.55 }),
      glass: new MeshPhysicalMaterial({
        color: '#8fa7b6',
        metalness: 0.1,
        roughness: 0.04,
        clearcoat: 1,
        envMapIntensity: 1.6,
        emissive: new Color('#ffc480'),
        emissiveIntensity: 0,
      }),
      concrete: new MeshStandardMaterial({ color: '#aaa59b', roughness: 0.92, bumpMap: disturb, bumpScale: 0.12 }),
      asphalt: new MeshStandardMaterial({ color: '#46464a', roughness: 1, bumpMap: disturb, bumpScale: 0.15 }),
      grass: new MeshStandardMaterial({ map: grassD, color: '#97a77a', roughness: 1 }),
      leaves: new MeshStandardMaterial({ color: '#3e5f2b', roughness: 0.9, bumpMap: disturb, bumpScale: 0.8 }),
      leavesLight: new MeshStandardMaterial({ color: '#56763a', roughness: 0.9, bumpMap: disturb, bumpScale: 0.8 }),
      bark: new MeshStandardMaterial({ color: '#5b4636', roughness: 1, bumpMap: disturb, bumpScale: 2 }),
      metal: new MeshStandardMaterial({ color: '#3a3d40', metalness: 0.8, roughness: 0.4 }),
      lampGlow: new MeshStandardMaterial({ color: '#fff1d6', emissive: new Color('#ffd9a0'), emissiveIntensity: 0 }),
      paint: new MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.6 }),
      roofRed: new MeshStandardMaterial({ map: roofTexture('#9c4a34', 1), roughness: 0.8 }),
      roofSlate: new MeshStandardMaterial({ map: roofTexture('#4d5560', 2), roughness: 0.7 }),
      fabric: (color: string) => {
        let m = fabricCache.get(color);
        if (!m) {
          m = new MeshStandardMaterial({ color, roughness: 0.95, bumpMap: disturb, bumpScale: 0.4 });
          fabricCache.set(color, m);
        }
        return m;
      },
    };
  }, [brickD, brickB, brickR, woodD, woodB, woodR, rough, disturb, grassD]);
}


export const MaterialsContext = createContext<Materials | null>(null);

/** Shared materials from the nearest MaterialsContext provider. */
export function useMats(): Materials {
  const m = useContext(MaterialsContext);
  if (!m) throw new Error('useMats must be used inside <MaterialsContext.Provider>');
  return m;
}
