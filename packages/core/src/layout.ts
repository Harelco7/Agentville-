/** Street geometry shared by the simulation and the 3D view. Units are metres. */
import type { Building, District, Vec2 } from './types';

export const ROAD_HALF = 3.5;
/** Centre line of each sidewalk (±). */
export const WALK_Z = 4.6;
/** Distance from the street centre to the centre of each lot. */
export const LOT_Z = 14;
/**
 * The town is a grid. Three long streets run west to east (Oak Street, Linden Street, Maple Street) and three
 * shorter cross streets join them (Mill Lane, Market Street, Hill Road). Lots line both sides of the long streets.
 * West to east the town runs through three neighbourhoods: Mill End, Downtown and Hillcrest.
 */
export interface Street {
  id: string;
  name: string;
  /** 'x': runs west to east at z = at. 'z': runs north to south at x = at. */
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
}

export const STREETS: Street[] = [
  { id: 'oak', name: 'Oak Street', axis: 'x', at: -64, from: -204, to: 204 },
  { id: 'linden', name: 'Linden Street', axis: 'x', at: 0, from: -204, to: 204 },
  { id: 'maple', name: 'Maple Street', axis: 'x', at: 64, from: -204, to: 204 },
  { id: 'mill-lane', name: 'Mill Lane', axis: 'z', at: -100, from: -68, to: 68 },
  { id: 'market', name: 'Market Street', axis: 'z', at: 0, from: -68, to: 68 },
  { id: 'hill-road', name: 'Hill Road', axis: 'z', at: 100, from: -68, to: 68 },
];
export const CROSS_XS = STREETS.filter((s) => s.axis === 'z').map((s) => s.at);
export const STREET_LENGTH = 408;
/** Lot centres along each long street: five lots in each block between cross streets. */
export const LOT_XS = [-200, -100, 0, 100].flatMap((start) => [16, 33, 50, 67, 84].map((o) => start + o));
/** Where each neighbourhood starts and ends. */
export const DISTRICTS: { id: District; name: string; from: number; to: number }[] = [
  { id: 'mill', name: 'Mill End', from: -204, to: -100 },
  { id: 'centre', name: 'Downtown', from: -100, to: 100 },
  { id: 'hill', name: 'Hillcrest', from: 100, to: 204 },
];
export function districtAt(x: number): District {
  return x < -100 ? 'mill' : x > 100 ? 'hill' : 'centre';
}
export function streetOf(id: string): Street {
  return STREETS.find((s) => s.id === id) ?? STREETS[1];
}
/** The z of the street a building faces. */
export function streetZ(b: Pick<Building, 'street'>): number {
  return streetOf(b.street ?? 'linden').at;
}
/** Centre of a building's lot in the world. */
export function lotCentre(b: Pick<Building, 'x' | 'side' | 'street'>): Vec2 {
  return { x: b.x, z: streetZ(b) + b.side * LOT_Z };
}

export const HOUSE_W = 10;
export const HOUSE_D = 8;

/** A spot an agent can stand or sit at, in the building's local frame (front faces +z). */
export interface Anchor {
  x: number;
  z: number;
  /** Facing angle in the local frame. */
  facing: number;
}

export type AnchorGroup = 'sofa' | 'dining' | 'kitchen' | 'bed' | 'front' | 'back' | 'counter' | 'bench' | 'pool' | 'site';

const A = (x: number, z: number, facing = 0): Anchor => ({ x, z, facing });
const row = (xs: number[], z: number, facing: number) => xs.map((x) => A(x, z, facing));

const OFFICE_LIKE = {
  front: [A(-2.8, 1.9, Math.PI), A(2.6, 1.9, Math.PI), A(-1.4, 2.6, Math.PI), A(1.2, 2.6, Math.PI)],
  back: [A(-2.8, -2.2, Math.PI), A(-1.6, -2.2, Math.PI), A(2.4, -2.2, Math.PI), A(3.4, -2.2, Math.PI), A(-2.8, -3.2, 0), A(2.4, -3.2, 0)],
  counter: [A(-0.2, 2.6, Math.PI), A(0.9, 2.6, Math.PI)],
};

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
  apartments: {
    sofa: [...row([1.2, 2.2, 3.2], 2.55, Math.PI), ...row([1.2, 2.2, 3.2], 1.2, 0)],
    dining: [...row([-3.4, -2.4, -1.4], 1.55, 0), ...row([-3.4, -2.4, -1.4], 2.85, Math.PI)],
    kitchen: [A(-2.9, -2.6, Math.PI), A(-1.8, -2.6, Math.PI)],
    bed: [...row([1.0, 2.0, 3.0, 4.0], -2.0, Math.PI / 2), ...row([1.0, 2.0, 3.0, 4.0], -3.1, Math.PI / 2)],
  },
  villa: {
    sofa: [A(1.7, 2.55, Math.PI), A(2.7, 2.55, Math.PI), A(3.6, 2.0, -Math.PI / 2)],
    dining: [A(-2.6, 1.55, 0), A(-2.6, 2.85, Math.PI), A(-3.6, 2.2, Math.PI / 2)],
    kitchen: [A(-2.9, -2.6, Math.PI), A(-1.8, -2.6, Math.PI)],
    bed: [A(1.5, -2.0, Math.PI / 2), A(1.5, -2.9, Math.PI / 2), A(3.4, -2.4, -Math.PI / 2)],
    pool: [A(7.2, 1.0, -Math.PI / 2), A(7.2, -1.0, -Math.PI / 2), A(8.6, 3.2, Math.PI), A(6.4, 3.2, Math.PI)],
  },
  townhall: OFFICE_LIKE,
  bank: OFFICE_LIKE,
  clinic: { ...OFFICE_LIKE, front: [...row([-3.4, -2.4, -1.4], 2.6, Math.PI / 2), A(2.6, 1.9, Math.PI)] },
  club: {
    front: [A(-2.4, 1.4), A(-1.2, 2.2, 1), A(0, 1.2, 2), A(1.2, 2.4, 3), A(2.4, 1.6, 4), A(-0.6, 2.9, 5), A(0.8, 0.4, 6), A(-1.8, 0.4, 0.5)],
    counter: [A(-2.8, -2.4, 0), A(-1.4, -2.4, 0)],
    back: [A(2.4, -2.0, Math.PI), A(3.4, -2.0, Math.PI), A(2.4, -3.2, 0), A(3.4, -3.2, 0)],
  },
  pool: {
    bench: [...row([-6, -4.5, -3, 3, 4.5, 6], 3.4, Math.PI), A(-6.5, -2.5, Math.PI / 2), A(6.5, -2.5, -Math.PI / 2)],
    pool: [A(-2, 0.2, 0.4), A(0, -1.2, 2), A(2, 0.6, 4), A(-1, 1.4, 1), A(1.4, -0.6, 5)],
    counter: [A(0, 3.6, 0)],
  },
  factory: {
    front: [A(-2.8, 2.4, Math.PI), A(2.6, 2.4, Math.PI)],
    back: [A(-3.6, -1.6, 0), A(-2.4, -1.6, 0), A(-1.2, -1.6, 0), A(1.2, -1.6, 0), A(2.4, -1.6, 0), A(3.6, -1.6, 0), A(-3, -3.0, Math.PI), A(3, -3.0, Math.PI)],
    counter: [A(-0.2, 2.6, Math.PI), A(1.0, 2.6, Math.PI)],
  },
  store: {
    front: [A(-2.6, 2.4, Math.PI), A(2.4, 2.4, Math.PI), A(0.9, 1.6, -Math.PI / 2), A(-1.2, 1.4, Math.PI / 2)],
    counter: [A(-2.6, -2.4, 0), A(-1.4, -2.4, 0)],
    back: [A(2.2, -2.4, Math.PI), A(3.2, -2.4, Math.PI)],
  },
  lot: {
    site: [A(-3.5, 2.5, 0), A(-1, 3, 0), A(1.5, 2.6, 0), A(3.6, 2.2, 0), A(-2.5, 0, Math.PI / 2), A(2.5, 0, -Math.PI / 2)],
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
  const z0 = streetZ(b);
  return b.side < 0 ? { x: b.x + p.x, z: z0 - LOT_Z + p.z } : { x: b.x - p.x, z: z0 + LOT_Z - p.z };
}

export function toWorldFacing(b: Building, facing: number): number {
  return b.side < 0 ? facing : facing + Math.PI;
}

export function buildingRotation(b: Building): number {
  return b.side < 0 ? 0 : Math.PI;
}

/** Kinds where people stay outdoors: the park, the public pool and building sites. */
export function isOutdoor(kind: Building['kind']): boolean {
  return kind === 'park' || kind === 'pool' || kind === 'lot';
}

/** Waypoints from the sidewalk to an anchor inside a building (local frame). */
function routeIn(b: Building, anchor: Anchor): Anchor[] {
  if (isOutdoor(b.kind)) return [A(anchor.x * 0.5, 6), anchor];
  // A villa's pool is in the side garden: walk round the hedge rather than through the house.
  if (Math.abs(anchor.x) > 5.2) return [A(Math.sign(anchor.x) * 8.6, 8.2), A(anchor.x, Math.max(anchor.z, 4.6)), anchor];
  const pts = [DOOR, ENTRY];
  if (anchor.z < -0.5) pts.push(...(anchor.x < 0.3 ? LEFT_HALL : RIGHT_HALL));
  pts.push(anchor);
  return pts;
}

export function sidewalkPoint(b: Building): Vec2 {
  return toWorld(b, SIDEWALK);
}

/** The long street nearest to a point, and which side of it the point is on. */
function nearestStreet(p: Vec2): { street: Street; side: -1 | 1 } {
  let best = STREETS[1];
  for (const st of STREETS) if (st.axis === 'x' && Math.abs(p.z - st.at) < Math.abs(p.z - best.at)) best = st;
  return { street: best, side: p.z < best.at ? -1 : 1 };
}

/**
 * A walking route from where the agent is to an anchor in the target building:
 * out of the current building, along the sidewalks (by way of a cross street if the target is on another street),
 * across the road if needed, and in.
 */
export function route(from: { pos: Vec2; inside: Building | null; anchor: Anchor | null }, to: Building, anchor: Anchor): Vec2[] {
  const pts: Vec2[] = [];
  let street: Street;
  let side: number;
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
    street = streetOf(from.inside.street);
    side = from.inside.side;
  } else {
    const near = nearestStreet(from.pos);
    street = near.street;
    side = near.side;
    // Outdoors but off the sidewalk: step onto it first.
    if (Math.abs(Math.abs(from.pos.z - street.at) - WALK_Z) > 0.6) pts.push({ x: from.pos.x, z: street.at + side * WALK_Z });
  }
  const here = () => (pts.length ? pts[pts.length - 1] : from.pos);
  const target = sidewalkPoint(to);
  const goal = streetOf(to.street);
  if (goal.id !== street.id) {
    // Walk to the best cross street, along it to the other street, and on from there.
    const x0 = here().x;
    const cross = CROSS_XS.reduce((b, c) => (Math.abs(x0 - c) + Math.abs(target.x - c) < Math.abs(x0 - b) + Math.abs(target.x - b) ? c : b), CROSS_XS[0]);
    const lane = cross + (x0 >= cross ? 1 : -1) * WALK_Z;
    pts.push({ x: lane, z: street.at + side * WALK_Z });
    const goalSide = to.side;
    pts.push({ x: lane, z: goal.at + goalSide * WALK_Z });
    side = goalSide;
  } else if (to.side !== side) {
    pts.push({ x: here().x, z: goal.at + to.side * WALK_Z });
  }
  pts.push(target, ...routeIn(to, anchor).map((p) => toWorld(to, p)));
  return pts;
}
