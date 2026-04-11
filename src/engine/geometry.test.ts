import { describe, it, expect } from 'vitest';
import { snapToGrid, ftToPx, pxToFt, intersectionArea, computeNetArea, isOverlapping } from './geometry';
import type { Room } from '../types';

const room = (overrides: Partial<Room> = {}): Room => ({
  id: 'r1', label: 'Room', floor: 'Floor 1',
  x: 0, y: 0, w: 10, h: 10,
  color: '#fff', isCutter: false, targetParent: null, openings: [],
  ...overrides,
});

describe('snapToGrid', () => {
  it('snaps to nearest 0.5', () => {
    expect(snapToGrid(1.3)).toBe(1.5);
    expect(snapToGrid(1.2)).toBe(1.0);
    expect(snapToGrid(0.0)).toBe(0.0);
  });
  it('respects custom grid size', () => {
    expect(snapToGrid(1.3, 1)).toBe(1);
    expect(snapToGrid(1.7, 1)).toBe(2);
  });
});

describe('ftToPx / pxToFt', () => {
  it('round-trips correctly at default ppf', () => {
    expect(ftToPx(5)).toBe(200);
    expect(pxToFt(200)).toBe(5);
  });
  it('round-trips with custom ppf', () => {
    expect(ftToPx(3, 50)).toBe(150);
    expect(pxToFt(150, 50)).toBe(3);
  });
});

describe('intersectionArea', () => {
  it('returns 0 for non-overlapping rooms', () => {
    const a = room({ x: 0, y: 0, w: 5, h: 5 });
    const b = room({ x: 6, y: 0, w: 5, h: 5 });
    expect(intersectionArea(a, b)).toBe(0);
  });
  it('returns full area when one room is inside another', () => {
    const a = room({ x: 0, y: 0, w: 10, h: 10 });
    const b = room({ x: 2, y: 2, w: 4, h: 4 });
    expect(intersectionArea(a, b)).toBe(16);
  });
  it('returns partial area for partial overlap', () => {
    const a = room({ x: 0, y: 0, w: 6, h: 6 });
    const b = room({ x: 4, y: 4, w: 6, h: 6 });
    expect(intersectionArea(a, b)).toBe(4); // 2×2 overlap
  });
});

describe('computeNetArea', () => {
  it('returns gross area when no cutters', () => {
    const r = room({ w: 16, h: 12 });
    expect(computeNetArea(r, [r])).toBe(192);
  });
  it('subtracts fully-contained cutter area', () => {
    const parent = room({ id: 'p', w: 16, h: 12 });
    const cutter = room({ id: 'c', x: 12, y: 0, w: 4, h: 6, isCutter: true, targetParent: 'p' });
    expect(computeNetArea(parent, [parent, cutter])).toBe(192 - 24);
  });
  it('only subtracts the overlapping portion for partial cutter', () => {
    const parent = room({ id: 'p', x: 0, y: 0, w: 10, h: 10 });
    // cutter extends 2ft outside the parent on the right
    const cutter = room({ id: 'c', x: 8, y: 0, w: 4, h: 5, isCutter: true, targetParent: 'p' });
    // overlap is 2×5 = 10, NOT 4×5 = 20
    expect(computeNetArea(parent, [parent, cutter])).toBe(100 - 10);
  });
});

describe('isOverlapping', () => {
  it('detects overlap', () => {
    const a = room({ x: 0, y: 0, w: 5, h: 5 });
    const b = room({ x: 3, y: 3, w: 5, h: 5 });
    expect(isOverlapping(a, b)).toBe(true);
  });
  it('returns false for touching (not overlapping) rooms', () => {
    const a = room({ x: 0, y: 0, w: 5, h: 5 });
    const b = room({ x: 5, y: 0, w: 5, h: 5 });
    expect(isOverlapping(a, b)).toBe(false);
  });
});
