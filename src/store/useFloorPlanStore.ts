import { create } from 'zustand';
import { snapToGrid, computeNetArea } from '../engine/geometry';
import type { Room, Opening, CanvasSettings, UiState, AppState } from '../types';

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
  suppressedCollisions: Set<string>; // keyed `${minId}:${maxId}` — transient, not persisted

  // Room mutations (all except rename push to history)
  addRoom: (x?: number, y?: number) => void;
  updateRoom: (id: string, patch: Partial<Pick<Room, 'x' | 'y' | 'w' | 'h' | 'color' | 'isCutter' | 'targetParent'>>) => void;
  batchMoveRooms: (moves: { id: string; x: number; y: number }[]) => void;
  mergeRooms: (idA: string, idB: string) => void;
  renameRoom: (id: string, label: string) => void;
  deleteRoom: (id: string) => void;
  deleteRooms: (ids: string[]) => void;

  // Opening mutations (push to history)
  addOpening: (roomId: string, opening: Omit<Opening, 'id'>) => void;
  removeOpening: (roomId: string, openingId: string) => void;

  // Collision suppression (Layer action — transient)
  suppressCollision: (idA: string, idB: string) => void;

  // Selection & placement mode
  setSelectedIds: (ids: string[]) => void;
  toggleSelectedId: (id: string) => void;
  setPlacingOpening: (type: 'door' | 'window' | null) => void;

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
    selectedIds: [],
    showNetArea: true,
    activeFloor: 'Floor 1',
    placingOpening: null,
  },
  past: [],
  future: [],
  suppressedCollisions: new Set<string>(),

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
      uiState: { ...get().uiState, selectedIds: [newRoom.id] },
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

  // ── Merge two rooms into bounding-box union (one undo step) ─────────────

  mergeRooms: (idA, idB) => {
    const { rooms, past } = get();
    const a = rooms.find((r) => r.id === idA);
    const b = rooms.find((r) => r.id === idB);
    if (!a || !b) return;

    const mx = Math.min(a.x, b.x);
    const my = Math.min(a.y, b.y);
    const mw = Math.max(a.x + a.w, b.x + b.w) - mx;
    const mh = Math.max(a.y + a.h, b.y + b.h) - my;
    const mergedId = crypto.randomUUID();

    const merged: Room = {
      id: mergedId,
      label: a.label,
      floor: a.floor,
      x: mx, y: my, w: mw, h: mh,
      color: a.color,
      isCutter: false,
      targetParent: null,
      openings: [],
    };

    const updated = rooms
      .filter((r) => r.id !== idA && r.id !== idB)
      .map((r) =>
        r.targetParent === idA || r.targetParent === idB
          ? { ...r, targetParent: mergedId }
          : r
      )
      .concat(merged);

    set({
      rooms: updated,
      past: pushHistory(past, rooms),
      future: [],
      uiState: { ...get().uiState, selectedIds: [mergedId] },
    });
  },

  // ── Openings ──────────────────────────────────────────────────────────────

  addOpening: (roomId, opening) => {
    const { rooms, past } = get();
    const newOpening: Opening = { ...opening, id: crypto.randomUUID() };
    const updated = rooms.map((r): Room =>
      r.id === roomId ? { ...r, openings: [...r.openings, newOpening] } : r
    );
    set({ rooms: updated, past: pushHistory(past, rooms), future: [] });
  },

  removeOpening: (roomId, openingId) => {
    const { rooms, past } = get();
    const updated = rooms.map((r): Room =>
      r.id === roomId ? { ...r, openings: r.openings.filter((o) => o.id !== openingId) } : r
    );
    set({ rooms: updated, past: pushHistory(past, rooms), future: [] });
  },

  // ── Suppress a collision pair (Layer action — transient) ──────────────────

  suppressCollision: (idA, idB) => {
    const key = [idA, idB].sort().join(':');
    set((s) => ({ suppressedCollisions: new Set([...s.suppressedCollisions, key]) }));
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
    const pruned = rooms.filter((r) => r.id !== id && r.targetParent !== id);
    set({ rooms: pruned, past: pushHistory(past, rooms), future: [], uiState: { ...get().uiState, selectedIds: [] } });
  },

  deleteRooms: (ids) => {
    const { rooms, past } = get();
    const idSet = new Set(ids);
    const pruned = rooms.filter(
      (r) => !idSet.has(r.id) && !(r.targetParent && idSet.has(r.targetParent))
    );
    set({ rooms: pruned, past: pushHistory(past, rooms), future: [], uiState: { ...get().uiState, selectedIds: [] } });
  },

  // ── Selection & placement ─────────────────────────────────────────────────

  setSelectedIds: (ids) => {
    set((s) => ({ uiState: { ...s.uiState, selectedIds: ids } }));
  },

  toggleSelectedId: (id) => {
    set((s) => {
      const { selectedIds } = s.uiState;
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
      return { uiState: { ...s.uiState, selectedIds: next } };
    });
  },

  setPlacingOpening: (type) => {
    set((s) => ({ uiState: { ...s.uiState, placingOpening: type } }));
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
      uiState: { ...get().uiState, selectedIds: [] },
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
      uiState: { ...get().uiState, selectedIds: [] },
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
      uiState: { selectedIds: [], showNetArea: uiState.showNetArea, activeFloor: uiState.activeFloor, placingOpening: null },
    };
    return JSON.stringify(state, null, 2);
  },

  importJson: (json) => {
    try {
      const state: AppState = JSON.parse(json);
      set({
        rooms: state.rooms ?? [],
        canvas: state.canvas ?? get().canvas,
        uiState: {
          selectedIds: [],
          showNetArea: (state.uiState as UiState & { showNetArea?: boolean })?.showNetArea ?? true,
          activeFloor: (state.uiState as UiState & { activeFloor?: string })?.activeFloor ?? 'Floor 1',
          placingOpening: null,
        },
        past: [],
        future: [],
      });
    } catch {
      console.error('Failed to parse floor plan JSON');
    }
  },
}));
