/** The colours the web app offers for cycles, by name */
export const CYCLE_COLOR_PALETTE = {
  blue: '#3b82f6',
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
  purple: '#a855f7',
  pink: '#ec4899',
  indigo: '#6366f1',
  teal: '#14b8a6',
  yellow: '#eab308',
  slate: '#64748b',
} as const;

export type CycleColorName = keyof typeof CYCLE_COLOR_PALETTE;

export const CYCLE_COLOR_NAMES = Object.keys(CYCLE_COLOR_PALETTE) as [
  CycleColorName,
  ...CycleColorName[],
];

/**
 * The palette name of a stored cycle colour. Cycles without one are drawn in
 * blue; a colour set through the API outside the palette stays as hex.
 */
export const cycleColorName = (color: string | null | undefined) => {
  if (!color) return 'blue';
  const hex = color.toLowerCase();
  return (
    CYCLE_COLOR_NAMES.find((name) => CYCLE_COLOR_PALETTE[name] === hex) ?? hex
  );
};
