import { create } from 'zustand';
import { snapToGrid, computeNetArea } from '../engine/geometry';
import type { Room, CanvasSettings, UiState, AppState } from '../types';

const MAX_HISTORY = 50;

const ROOM_COLORS = [
  '#e0e0e0', '#dbeafe', '#dcfce7', '#fef9c3',
  '#fce7f3', '#ede9fe', '#ffedd5', '#cffafe',
];

const pushHistory = (past: Room[][], snapshot: Room[]): Room[][] =>
  [...past.slice(-(MAX_HISTORY - 1)), structuredClone(snapshot)];

// ─── Store shape ──────────────────────────────────────────────────────────────

interface FloorPlanStore {
  rooms: Room[];
  canvas: CanvasSettings;
  uiState: UiState;
  past: Room[][];   // undo stack (snapshots of rooms array)
  future: Room[][]; // redo stack

  // Room mutations (all except rename push to history)
  addRoom: (x?: number, y?: number) => void;
  updateRoom: (id: string, patch: Partial<Pick<Room, 'x' | 'y' | 'w' | 'h' | 'color' | 'isCutter' | 'targetParent'>>) => void;
  batchMoveRooms: (moves: { id: string; x: number; y: number }[]) => void; // atomic multi-room move (one undo step)
  renameRoom: (id: string, label: string) => void; // live update, no history push
  deleteRoom: (id: string) => void;

  // Selection
  setSelectedId: (id: string | null) => void;

  // History
  undo: () => void;
  redo: () => void;

  // Computed
  getNetArea: (id: string) => number;

  // Persistence
  exportJson: () => string;
  importJson: (json: string) => void;
}

// ─── Store implementation ─────────────────────────────────────────────────────

export const useFloorPlanStore = create<FloorPlanStore>((set, get) => ({
  rooms: [],
  canvas: {
    gridSnap: 0.5,
    unit: 'ft',
    ppf: 40,
    floors: ['Basement', 'Floor 1', 'Floor 2'],
  },
  uiState: {
    selectedId: null,
    showNetArea: true,
    activeFloor: 'Floor 1',
  },
  past: [],
  future: [],

  // ── Add ──────────────────────────────────────────────────────────────────

  addRoom: (x = 2, y = 2) => {
    const { rooms, past, canvas } = get();
    const newRoom: Room = {
      id: crypto.randomUUID(),
      label: `Room ${rooms.length + 1}`,
      floor: get().uiState.activeFloor,
      x: snapToGrid(x, canvas.gridSnap),
      y: snapToGrid(y, canvas.gridSnap),
      w: 10,
      h: 10,
      color: ROOM_COLORS[rooms.length % ROOM_COLORS.length],
      isCutter: false,
      targetParent: null,
      openings: [],
    };
    set({
      rooms: [...rooms, newRoom],
      past: pushHistory(past, rooms),
      future: [],
      uiState: { ...get().uiState, selectedId: newRoom.id },
    });
  },

  // ── Update (position / size — always snapped) ────────────────────────────

  updateRoom: (id, patch) => {
    const { rooms, past, canvas } = get();
    const updated = rooms.map((r): Room => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      return {
        ...next,
        x: 'x' in patch ? snapToGrid(next.x, canvas.gridSnap) : next.x,
        y: 'y' in patch ? snapToGrid(next.y, canvas.gridSnap) : next.y,
        w: 'w' in patch ? Math.max(snapToGrid(next.w, canvas.gridSnap), canvas.gridSnap) : next.w,
        h: 'h' in patch ? Math.max(snapToGrid(next.h, canvas.gridSnap), canvas.gridSnap) : next.h,
      };
    });
    set({ rooms: updated, past: pushHistory(past, rooms), future: [] });
  },

  // ── Batch move (Sticky Push — one undo step for all displaced rooms) ─────

  batchMoveRooms: (moves) => {
    const { rooms, past, canvas } = get();
    const lookup = new Map(moves.map((m) => [m.id, m]));
    const updated = rooms.map((r): Room => {
      const move = lookup.get(r.id);
      if (!move) return r;
      return {
        ...r,
        x: snapToGrid(move.x, canvas.gridSnap),
        y: snapToGrid(move.y, canvas.gridSnap),
      };
    });
    set({ rooms: updated, past: pushHistory(past, rooms), future: [] });
  },

  // ── Rename (live, no history) ─────────────────────────────────────────────

  renameRoom: (id, label) => {
    set((s) => ({
      rooms: s.rooms.map((r) => (r.id === id ? { ...r, label } : r)),
    }));
  },

  // ── Delete ────────────────────────────────────────────────────────────────

  deleteRoom: (id) => {
    const { rooms, past } = get();
    // Also remove any cutter children that belong to this room
    const pruned = rooms.filter((r) => r.id !== id && r.targetParent !== id);
    set({
      rooms: pruned,
      past: pushHistory(past, rooms),
      future: [],
      uiState: { ...get().uiState, selectedId: null },
    });
  },

  // ── Selection ─────────────────────────────────────────────────────────────

  setSelectedId: (id) => {
    set((s) => ({ uiState: { ...s.uiState, selectedId: id } }));
  },

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  undo: () => {
    const { past, rooms, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      rooms: prev,
      past: past.slice(0, -1),
      future: [structuredClone(rooms), ...future],
      uiState: { ...get().uiState, selectedId: null },
    });
  },

  redo: () => {
    const { past, rooms, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      rooms: next,
      past: [...past, structuredClone(rooms)],
      future: future.slice(1),
      uiState: { ...get().uiState, selectedId: null },
    });
  },

  // ── Computed ──────────────────────────────────────────────────────────────

  getNetArea: (id) => {
    const { rooms } = get();
    const room = rooms.find((r) => r.id === id);
    if (!room) return 0;
    return computeNetArea(room, rooms);
  },

  // ── Persistence ───────────────────────────────────────────────────────────

  exportJson: () => {
    const { rooms, canvas, uiState } = get();
    const state: AppState = {
      version: '1.0-MVP',
      meta: {
        projectTitle: 'My Floor Plan',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      canvas,
      rooms,
      uiState: { selectedId: null, showNetArea: uiState.showNetArea, activeFloor: uiState.activeFloor },
    };
    return JSON.stringify(state, null, 2);
  },

  importJson: (json) => {
    try {
      const state: AppState = JSON.parse(json);
      set({
        rooms: state.rooms ?? [],
        canvas: state.canvas ?? get().canvas,
        uiState: { ...(state.uiState ?? {}), selectedId: null },
        past: [],
        future: [],
      });
    } catch {
      console.error('Failed to parse floor plan JSON');
    }
  },
}));
