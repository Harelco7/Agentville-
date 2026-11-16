/**
 * Phones and small laptops get a lighter picture: one pixel per screen pixel, no shadows, no post-processing
 * and fewer lamp lights. Add ?lite or #lite to the address to force it.
 * The whole town is now three streets, which is a lot for a phone's graphics chip.
 */
const nav = navigator as Navigator & { deviceMemory?: number };
export const LITE =
  new URLSearchParams(location.search).has('lite') ||
  location.hash === '#lite' ||
  matchMedia('(pointer: coarse)').matches ||
  Math.min(screen.width, screen.height) < 700 ||
  (nav.deviceMemory !== undefined && nav.deviceMemory <= 4);
