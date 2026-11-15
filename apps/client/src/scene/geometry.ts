import { BoxGeometry, BufferGeometry, ExtrudeGeometry, Shape } from 'three';

/**
 * A box whose UVs are in real-world units (metres / texScale), so a brick or
 * wood texture keeps the same size on a 1 m wall piece and a 10 m wall.
 */
export function scaledBox(w: number, h: number, d: number, texScale = 1): BoxGeometry {
  const geo = new BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  // Face order: +x, -x, +y, -y, +z, -z. Each face has 4 vertices.
  const faceU = [d, d, w, w, w, w];
  const faceV = [h, h, d, d, h, h];
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, (uv.getX(idx) * faceU[face]) / texScale, (uv.getY(idx) * faceV[face]) / texScale);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/** A triangular gable end, extruded `depth` metres, with UVs in metres / texScale. */
export function gable(width: number, rise: number, depth: number, texScale = 1): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, rise);
  shape.lineTo(-width / 2, 0);
  const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / texScale, uv.getY(i) / texScale);
  uv.needsUpdate = true;
  geo.translate(0, 0, -depth / 2);
  return geo;
}

export interface Opening {
  /** Left and right edge along the wall, metres from the wall's centre. */
  x0: number;
  x1: number;
  /** Bottom and top edge, metres above the wall's base. */
  y0: number;
  y1: number;
  kind: 'window' | 'door' | 'gap';
}

export interface WallPiece {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Splits a wall into solid boxes around its openings. The wall runs along local x,
 * from -length/2 to +length/2, and from y = 0 to y = height.
 */
export function wallPieces(length: number, height: number, openings: Opening[]): WallPiece[] {
  const xs = new Set<number>([-length / 2, length / 2]);
  for (const o of openings) {
    xs.add(o.x0);
    xs.add(o.x1);
  }
  const cuts = [...xs].sort((a, b) => a - b);
  const pieces: WallPiece[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (b - a < 1e-6) continue;
    const mid = (a + b) / 2;
    const hole = openings.find((o) => mid > o.x0 && mid < o.x1);
    if (!hole) {
      pieces.push({ x: mid, y: height / 2, w: b - a, h: height });
      continue;
    }
    if (hole.y0 > 0) pieces.push({ x: mid, y: hole.y0 / 2, w: b - a, h: hole.y0 });
    if (hole.y1 < height) pieces.push({ x: mid, y: (hole.y1 + height) / 2, w: b - a, h: height - hole.y1 });
  }
  return pieces;
}
