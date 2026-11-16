/**
 * Phones and small laptops get a lighter picture: fewer pixels, smaller shadow maps and no ambient occlusion.
 * The whole town is now three streets, which is a lot for a phone's graphics chip.
 */
const nav = navigator as Navigator & { deviceMemory?: number };
export const LITE =
  new URLSearchParams(location.search).has('lite') ||
  matchMedia('(pointer: coarse)').matches ||
  Math.min(screen.width, screen.height) < 700 ||
  (nav.deviceMemory !== undefined && nav.deviceMemory <= 4);
