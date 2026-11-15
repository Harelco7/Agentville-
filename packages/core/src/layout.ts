/** Street geometry shared by the simulation and the 3D view. Units are metres. */
import type { Building, Vec2 } from './types';

export const ROAD_HALF = 3.5;
/** Centre line of each sidewalk (±). */
export const WALK_Z = 4.6;
/** Distance from the street centre to the centre of each lot. */
export const LOT_Z = 14;
export const STREET_LENGTH = 160;
export const LOT_XS = [-50, -30, -10, 10, 30, 50] as const;
/** The newer business lot at the east end of the street, where the hi-tech company is. */
export const TECH_LOT = { x: 70, side: -1 as const };
export const HOUSE_W = 10;
export const HOUSE_D = 8;

/** A spot an agent can stand or sit at, in the building's local frame (front faces +z). */
export interface Anchor {
  x: number;
  z: number;
  /** Facing angle in the local frame. */
  facing: number;
}

export type AnchorGroup = 'sofa' | 'dining' | 'kitchen' | 'bed' | 'front' | 'back' | 'counter' | 'bench';

const A = (x: number, z: number, facing = 0): Anchor => ({ x, z, facing });

/** Spots inside each kind of building, grouped by what happens there. */
export const ANCHORS: Record<Building['kind'], Partial<Record<AnchorGroup, Anchor[]>>> = {
  home: {
    sofa: [A(1.7, 2.55, Math.PI), A(2.7, 2.55, Math.PI)],
    dining: [A(-2.6, 1.55, 0), A(-2.6, 2.85, Math.PI)],
    kitchen: [A(-2.9, -2.6, Math.PI), A(-1.8, -2.6, Math.PI)],
    bed: [A(1.5, -2.0, Math.PI / 2), A(1.5, -2.9, Math.PI / 2)],
  },
  cafe: {
    front: [A(-3.2, 1.9, Math.PI / 2), A(-1.9, 1.9, -Math.PI / 2), A(1.6, 1.9, Math.PI / 2), A(2.9, 1.9, -Math.PI / 2), A(-3.2, 3.0, Math.PI / 2), A(-1.9, 3.0, -Math.PI / 2)],
    counter: [A(-2.6, -2.5, 0), A(-1.6, -2.5, 0)],
    back: [A(2.0, -2.4, Math.PI / 2), A(3.2, -2.4, -Math.PI / 2)],
  },
  shop: {
    front: [A(-2.6, 2.4, Math.PI), A(2.4, 2.4, Math.PI), A(0.9, 1.6, -Math.PI / 2)],
    counter: [A(-2.6, -2.4, 0)],
    back: [A(2.2, -2.4, Math.PI)],
  },
  office: {
    front: [A(-2.8, 1.9, Math.PI), A(2.6, 1.9, Math.PI)],
    back: [A(-2.8, -2.2, Math.PI), A(-1.6, -2.2, Math.PI), A(2.4, -2.2, Math.PI), A(3.4, -2.2, Math.PI)],
    counter: [A(-0.2, 2.6, Math.PI)],
  },
  tech: {
    front: [A(2.4, 2.4, -Math.PI / 2), A(3.6, 2.4, Math.PI / 2), A(2.4, 3.3, -Math.PI / 2), A(3.6, 3.3, Math.PI / 2)],
    back: [A(-3.4, -2.0, Math.PI), A(-2.2, -2.0, Math.PI), A(-3.4, -3.1, 0), A(-2.2, -3.1, 0), A(2.2, -2.0, Math.PI), A(3.4, -2.0, Math.PI), A(2.2, -3.1, 0), A(3.4, -3.1, 0)],
    counter: [A(-2.6, 2.2, Math.PI)],
  },
  park: {
    bench: [A(-4.2, 2.4, 0), A(-3.2, 2.4, 0), A(3.2, 2.4, 0), A(4.2, 2.4, 0), A(-1.2, -3.2, Math.PI), A(1.2, -3.2, Math.PI), A(0, 0.9, Math.PI)],
  },
};

export const DOOR: Anchor = A(0, HOUSE_D / 2 + 0.4, 0);
const ENTRY = A(0, 3.0);
const LEFT_HALL = [A(-2.3, 0.4), A(-2.3, -1.2)];
const RIGHT_HALL = [A(1.7, 0.4), A(1.7, -1.2)];
/** The point where the front path meets the sidewalk, in the local frame. */
const SIDEWALK = A(0, LOT_Z - WALK_Z);

/** Building-local point to world point. North-side lots face +z, south-side lots are turned around. */
export function toWorld(b: Building, p: { x: number; z: number }): Vec2 {
  return b.side < 0 ? { x: b.x + p.x, z: -LOT_Z + p.z } : { x: b.x - p.x, z: LOT_Z - p.z };
}

export function toWorldFacing(b: Building, facing: number): number {
  return b.side < 0 ? facing : facing + Math.PI;
}

export function buildingRotation(b: Building): number {
  return b.side < 0 ? 0 : Math.PI;
}

/** Waypoints from the sidewalk to an anchor inside a building (local frame). */
function routeIn(b: Building, anchor: Anchor): Anchor[] {
  if (b.kind === 'park') return [A(anchor.x * 0.5, 6), anchor];
  const pts = [DOOR, ENTRY];
  if (anchor.z < -0.5) pts.push(...(anchor.x < 0.3 ? LEFT_HALL : RIGHT_HALL));
  pts.push(anchor);
  return pts;
}

export function sidewalkPoint(b: Building): Vec2 {
  return toWorld(b, SIDEWALK);
}

/**
 * A walking route from where the agent is to an anchor in the target building:
 * out of the current building, along the sidewalk, across the street if needed, and in.
 */
export function route(from: { pos: Vec2; inside: Building | null; anchor: Anchor | null }, to: Building, anchor: Anchor): Vec2[] {
  const pts: Vec2[] = [];
  let side: number = from.pos.z < 0 ? -1 : 1;
  if (from.inside && from.anchor) {
    if (from.inside.id === to.id) {
      // Moving between rooms of the same building.
      const out = routeIn(from.inside, from.anchor).slice(1, -1).reverse();
      const inn = routeIn(to, anchor).slice(1);
      const sameHalf = (from.anchor.z < -0.5) === (anchor.z < -0.5) && (from.anchor.x < 0.3) === (anchor.x < 0.3);
      return (sameHalf ? [anchor] : [...out, ...inn]).map((p) => toWorld(to, p));
    }
    const out = routeIn(from.inside, from.anchor).slice(0, -1).reverse();
    pts.push(...out.map((p) => toWorld(from.inside!, p)), sidewalkPoint(from.inside));
    side = from.inside.side;
  } else if (Math.abs(Math.abs(from.pos.z) - WALK_Z) > 0.6) {
    // Outdoors but off the sidewalk: step onto it first.
    pts.push({ x: from.pos.x, z: side * WALK_Z });
  }
  const target = sidewalkPoint(to);
  if (to.side !== side) {
    const last = pts.length ? pts[pts.length - 1] : from.pos;
    pts.push({ x: last.x, z: to.side * WALK_Z });
  }
  pts.push(target, ...routeIn(to, anchor).map((p) => toWorld(to, p)));
  return pts;
}
