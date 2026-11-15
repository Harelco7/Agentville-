import { Color, MathUtils, Vector3 } from 'three';

export interface SunState {
  /** Unit vector pointing from the ground towards the sun. */
  direction: Vector3;
  /** 1 in full daylight, 0 at night, smooth through dawn and dusk. */
  day: number;
  /** 1 at night, 0 in daylight. */
  night: number;
  /** Sunlight colour: warm near the horizon, near-white at noon. */
  color: Color;
  /** Fog and ambient tint for the current time. */
  fog: Color;
}

const warm = new Color('#ffb27a');
const noon = new Color('#fff3e2');
const dayFog = new Color('#cfdbe4');
const duskFog = new Color('#e6b89a');
const nightFog = new Color('#0d1424');

/** Sun position and light levels for an hour of the day (sunrise 6:00, sunset 18:00). */
export function sunAt(hour: number): SunState {
  const angle = ((hour - 6) / 12) * Math.PI;
  const direction = new Vector3(-Math.cos(angle), Math.sin(angle) * 0.9, -0.45).normalize();
  const day = MathUtils.smoothstep(direction.y, -0.06, 0.22);
  const low = 1 - MathUtils.smoothstep(direction.y, 0.05, 0.45);
  const color = noon.clone().lerp(warm, low);
  const fog = nightFog.clone().lerp(dayFog.clone().lerp(duskFog, low * 0.8), day);
  return { direction, day, night: 1 - day, color, fog };
}
