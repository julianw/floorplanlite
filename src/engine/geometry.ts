import type { Room } from '../types';

export const GRID_FT = 0.5;      // default snap grid in feet
export const DEFAULT_PPF = 40;   // default pixels per foot

/** Quantize a value to the nearest grid step */
export const snapToGrid = (value: number, grid = GRID_FT): number =>
  Math.round(value / grid) * grid;

/** Convert feet → pixels */
export const ftToPx = (ft: number, ppf = DEFAULT_PPF): number => ft * ppf;

/** Convert pixels → feet */
export const pxToFt = (px: number, ppf = DEFAULT_PPF): number => px / ppf;

/**
 * Area of the intersection rectangle between two rooms.
 * Returns 0 if they do not overlap.
 * Used instead of the full cutter area so partial overlaps are handled correctly.
 */
export const intersectionArea = (a: Room, b: Room): number => {
  const overlapW = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const overlapH = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return overlapW * overlapH;
};

/**
 * Net area of a room after subtracting all cutter children.
 * Formula: Actual_Area = (W × H) − Σ(Overlapping_Cutter_Areas)
 *
 * MVP assumption: cutters are fully contained inside their parent, so
 * intersectionArea === cutter's own area. The intersectionArea helper
 * keeps this correct even if that assumption is violated.
 */
export const computeNetArea = (room: Room, allRooms: Room[]): number => {
  const gross = room.w * room.h;
  const cutters = allRooms.filter((r) => r.isCutter && r.targetParent === room.id);
  const cutArea = cutters.reduce((sum, c) => sum + intersectionArea(room, c), 0);
  return gross - cutArea;
};

/** Axis-Aligned Bounding Box overlap check */
export const isOverlapping = (a: Room, b: Room): boolean =>
  a.x < b.x + b.w &&
  a.x + a.w > b.x &&
  a.y < b.y + b.h &&
  a.y + a.h > b.y;
