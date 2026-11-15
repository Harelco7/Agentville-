/** Time in Agentville. One sim year is 28 sim days; at 1x speed one sim day lasts 22.5 real minutes. */

export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_YEAR = 28;
/** Sim minutes that pass per real second at 1x (1440 sim minutes in 1350 real seconds). */
export const BASE_SPEED = MINUTES_PER_DAY / (22.5 * 60);

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const dayOf = (t: number) => Math.floor(t / MINUTES_PER_DAY) + 1;
export const minuteOfDay = (t: number) => ((t % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
export const hourOf = (t: number) => minuteOfDay(t) / 60;
export const weekdayOf = (t: number) => WEEKDAYS[(dayOf(t) - 1) % 7];
export const isWeekend = (t: number) => (dayOf(t) - 1) % 7 >= 5;
export const yearOf = (t: number) => Math.floor((dayOf(t) - 1) / DAYS_PER_YEAR) + 1;

export function clockText(t: number): string {
  const m = Math.floor(minuteOfDay(t));
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function partOfDay(t: number): string {
  const h = hourOf(t);
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

/** "Tuesday 14:05, day 2 of year 1" */
export function longTime(t: number): string {
  return `${weekdayOf(t)} ${clockText(t)}, day ${((dayOf(t) - 1) % DAYS_PER_YEAR) + 1} of year ${yearOf(t)}`;
}
