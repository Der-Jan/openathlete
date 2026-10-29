import { m } from '@/paraglide/messages';

import {
  CYCLE_COLOR_NAMES,
  CYCLE_COLOR_PALETTE,
  CycleColorName,
} from '@openathlete/shared';

const LABELS: Record<CycleColorName, () => string> = {
  blue: m.color_blue,
  green: m.color_green,
  orange: m.color_orange,
  red: m.color_red,
  purple: m.color_purple,
  pink: m.color_pink,
  indigo: m.color_indigo,
  teal: m.color_teal,
  yellow: m.color_yellow,
  slate: m.color_slate,
};

// Predefined color palette for cycles, shared with the MCP tools which name
// the colors the same way
export const CYCLE_COLORS = CYCLE_COLOR_NAMES.map((color) => ({
  name: LABELS[color](),
  value: CYCLE_COLOR_PALETTE[color],
}));

export const DEFAULT_CYCLE_COLOR = CYCLE_COLOR_PALETTE.blue;
