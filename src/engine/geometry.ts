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

/**
 * Returns rooms from `candidates` that are edge-touching `room` in the
 * direction of the drag (dx, dy). Used for Sticky Push BFS chain detection.
 *
 * A candidate qualifies when:
 *  - Its leading edge is within `tolerance` ft of room's trailing edge in
 *    the drag direction.
 *  - They share at least some perpendicular extent (not just corner-to-corner).
 *
 * Diagonal drags check both axes independently.
 */
export const touchingInDirection = (
  room: { x: number; y: number; w: number; h: number },
  candidates: Room[],
  dx: number,
  dy: number,
  tolerance = 0.05,
): Room[] => {
  const result: Room[] = [];
  const seen = new Set<string>();

  for (const other of candidates) {
    if (seen.has(other.id)) continue;
    let touches = false;

    if (dx > 0) {
      if (
        Math.abs((room.x + room.w) - other.x) <= tolerance &&
        Math.max(room.y, other.y) < Math.min(room.y + room.h, other.y + other.h)
      ) touches = true;
    } else if (dx < 0) {
      if (
        Math.abs((other.x + other.w) - room.x) <= tolerance &&
        Math.max(room.y, other.y) < Math.min(room.y + room.h, other.y + other.h)
      ) touches = true;
    }

    if (!touches && dy > 0) {
      if (
        Math.abs((room.y + room.h) - other.y) <= tolerance &&
        Math.max(room.x, other.x) < Math.min(room.x + room.w, other.x + other.w)
      ) touches = true;
    } else if (!touches && dy < 0) {
      if (
        Math.abs((other.y + other.h) - room.y) <= tolerance &&
        Math.max(room.x, other.x) < Math.min(room.x + room.w, other.x + other.w)
      ) touches = true;
    }

    if (touches) {
      result.push(other);
      seen.add(other.id);
    }
  }

  return result;
};

/**
 * Returns the intersection rectangle of two rooms in feet, or null if they
 * don't overlap. Used to render collision highlights on the canvas.
 */
export const intersectionRect = (
  a: Room, b: Room
): { x: number; y: number; w: number; h: number } | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
};
