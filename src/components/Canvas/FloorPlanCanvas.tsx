import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Text, Group, Line, Path } from 'react-konva';
import type Konva from 'konva';
import { useFloorPlanStore } from '../../store/useFloorPlanStore';
import { ftToPx, pxToFt, snapToGrid, intersectionArea, intersectionRect, touchingInDirection } from '../../engine/geometry';
import { ResizeInput } from './ResizeInput';
import { LabelInput } from './LabelInput';
import { ConflictMenu } from './ConflictMenu';
import type { Room, Opening } from '../../types';

// ── Opening / wall rendering helpers ─────────────────────────────────────────

const WALL_HIT_PX = 14; // px — proximity to an edge that counts as "on that wall"

function wallPts(
  edge: Opening['edge'], s: number, e: number, pw: number, ph: number
): number[] {
  switch (edge) {
    case 'top':    return [s, 0, e, 0];
    case 'right':  return [pw, s, pw, e];
    case 'bottom': return [s, ph, e, ph];
    default:       return [0, s, 0, e]; // left
  }
}

/**
 * Detect which wall edge the pointer is nearest to, or null if too far from
 * any edge. Coordinates are in Konva group-local pixels.
 */
function detectEdge(
  x: number, y: number, pw: number, ph: number
): Opening['edge'] | null {
  const candidates: [number, Opening['edge']][] = [
    [y,      'top'],
    [ph - y, 'bottom'],
    [x,      'left'],
    [pw - x, 'right'],
  ];
  candidates.sort((a, b) => a[0] - b[0]);
  return candidates[0][0] <= WALL_HIT_PX ? candidates[0][1] : null;
}

/** Convert a pointer position inside a room group to an offset in feet along the detected edge. */
function edgeOffsetFt(edge: Opening['edge'], x: number, y: number, ppf: number): number {
  return (edge === 'top' || edge === 'bottom' ? x : y) / ppf;
}

function doorShapes(
  id: string, edge: Opening['edge'],
  gS: number, gE: number, pw: number, ph: number, color: string
): React.ReactNode[] {
  const g = gE - gS;
  let leafPts: number[];
  let arcData: string;

  // Arc math: hinge at gap-start corner; door leaf swings 90° into room.
  // Sweep direction chosen so the quarter-circle lies inside the room boundary.
  switch (edge) {
    case 'top':
      leafPts = [gS, 0, gS, g];
      arcData = `M ${gS} ${g} A ${g} ${g} 0 0 0 ${gE} 0`;
      break;
    case 'right':
      leafPts = [pw, gS, pw - g, gS];
      arcData = `M ${pw - g} ${gS} A ${g} ${g} 0 0 0 ${pw} ${gE}`;
      break;
    case 'bottom':
      leafPts = [gS, ph, gS, ph - g];
      arcData = `M ${gS} ${ph - g} A ${g} ${g} 0 0 1 ${gE} ${ph}`;
      break;
    default: // left
      leafPts = [0, gS, g, gS];
      arcData = `M ${g} ${gS} A ${g} ${g} 0 0 1 0 ${gE}`;
  }

  return [
    <Line key={`dl-${id}`} points={leafPts} stroke={color} strokeWidth={1.5} listening={false} />,
    <Path key={`da-${id}`} data={arcData} stroke={color} strokeWidth={1} fill="transparent" listening={false} />,
  ];
}

function windowShapes(
  id: string, edge: Opening['edge'],
  gS: number, gE: number, pw: number, ph: number, color: string
): React.ReactNode[] {
  // Two parallel glazing lines inside the gap, offset slightly from the wall face.
  const in1 = 3, in2 = 7;
  let pts1: number[], pts2: number[];

  switch (edge) {
    case 'top':
      pts1 = [gS, in1, gE, in1]; pts2 = [gS, in2, gE, in2]; break;
    case 'right':
      pts1 = [pw - in1, gS, pw - in1, gE]; pts2 = [pw - in2, gS, pw - in2, gE]; break;
    case 'bottom':
      pts1 = [gS, ph - in1, gE, ph - in1]; pts2 = [gS, ph - in2, gE, ph - in2]; break;
    default: // left
      pts1 = [in1, gS, in1, gE]; pts2 = [in2, gS, in2, gE];
  }

  return [
    <Line key={`wl1-${id}`} points={pts1} stroke={color} strokeWidth={1.5} listening={false} />,
    <Line key={`wl2-${id}`} points={pts2} stroke={color} strokeWidth={1.5} listening={false} />,
  ];
}

/**
 * Render all four walls of a room as individual Line segments, leaving gaps
 * where openings are and drawing the appropriate architectural symbol in each gap.
 */
function buildWallShapes(
  room: Room, pw: number, ph: number, ppf: number,
  strokeColor: string, strokeWidth: number, dash?: number[]
): React.ReactNode[] {
  const shapes: React.ReactNode[] = [];
  const edges: Opening['edge'][] = ['top', 'right', 'bottom', 'left'];

  for (const edge of edges) {
    const sorted = room.openings
      .filter((o) => o.edge === edge)
      .sort((a, b) => a.offset - b.offset);
    const edgeLenFt = edge === 'top' || edge === 'bottom' ? room.w : room.h;
    let curFt = 0;

    for (const o of sorted) {
      const endFt = Math.min(o.offset + o.w, edgeLenFt);
      if (o.offset > curFt) {
        shapes.push(
          <Line key={`ws-${edge}-${o.id}-pre`}
            points={wallPts(edge, curFt * ppf, o.offset * ppf, pw, ph)}
            stroke={strokeColor} strokeWidth={strokeWidth} dash={dash} listening={false}
          />
        );
      }
      const gS = o.offset * ppf, gE = endFt * ppf;
      shapes.push(
        ...(o.type === 'door'
          ? doorShapes(o.id, edge, gS, gE, pw, ph, strokeColor)
          : windowShapes(o.id, edge, gS, gE, pw, ph, strokeColor))
      );
      curFt = endFt;
    }

    if (curFt < edgeLenFt) {
      shapes.push(
        <Line key={`ws-${edge}-tail`}
          points={wallPts(edge, curFt * ppf, edgeLenFt * ppf, pw, ph)}
          stroke={strokeColor} strokeWidth={strokeWidth} dash={dash} listening={false}
        />
      );
    }
  }

  return shapes;
}

// ── Overlay state shapes ──────────────────────────────────────────────────────

interface ResizeMode {
  roomId: string;
  field: 'w' | 'h';
  value: string;
}

interface RenameMode {
  roomId: string;
  value: string;
}

interface ConflictMenuState {
  roomA: Room;
  roomB: Room;
  screenX: number;
  screenY: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FloorPlanCanvas() {
  const stageRef    = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPanning   = useRef(false);

  const [size, setSize]             = useState({ width: 100, height: 100 });
  const [resizeMode, setResizeMode] = useState<ResizeMode | null>(null);
  const [renameMode, setRenameMode] = useState<RenameMode | null>(null);
  const [zoomLevel, setZoomLevel]   = useState(100); // percentage, for toolbar display
  const [shiftHeld, setShiftHeld]         = useState(false); // Stamp Mode indicator
  const [altHeld, setAltHeld]             = useState(false); // Sticky Push indicator
  const [conflictMenu, setConflictMenu]   = useState<ConflictMenuState | null>(null);
  // rubber-band selection: coordinates in Konva layer-local space (px)
  const [rubberBand, setRubberBand]       = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const {
    rooms, uiState, canvas,
    updateRoom, batchMoveRooms, mergeRooms, renameRoom, deleteRoom, deleteRooms,
    addOpening, removeOpening,
    setSelectedIds, toggleSelectedId, setPlacingOpening,
    suppressedCollisions, suppressCollision,
    undo, redo, getNetArea,
  } = useFloorPlanStore();

  const placingOpening = uiState.placingOpening;

  const selectedIds = uiState.selectedIds;
  const { ppf, gridSnap } = canvas;

  // ── Responsive canvas size ────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Zoom helpers & export — declared before keyboard effect ─────────────

  const dismissOverlays = useCallback(() => {
    setResizeMode(null);
    setRenameMode(null);
    setConflictMenu(null);
  }, []);

  /** Reset scale to 100% and pan back to origin. */
  const resetZoom = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    setZoomLevel(100);
  }, []);

  /**
   * Scale and pan the stage so all rooms on the current floor fit in the
   * viewport with a padding margin. Capped at 400% to avoid excessive zoom.
   */
  const fitToScreen = useCallback((rooms: Room[]) => {
    const stage = stageRef.current;
    if (!stage || rooms.length === 0) return;
    const PADDING = 60; // px
    const minX = Math.min(...rooms.map((r) => r.x));
    const minY = Math.min(...rooms.map((r) => r.y));
    const maxX = Math.max(...rooms.map((r) => r.x + r.w));
    const maxY = Math.max(...rooms.map((r) => r.y + r.h));
    const contentW = ftToPx(maxX - minX, ppf);
    const contentH = ftToPx(maxY - minY, ppf);
    const scaleX = (size.width  - PADDING * 2) / contentW;
    const scaleY = (size.height - PADDING * 2) / contentH;
    const scale  = Math.min(scaleX, scaleY, 4);
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (size.width  - contentW * scale) / 2 - ftToPx(minX, ppf) * scale,
      y: (size.height - contentH * scale) / 2 - ftToPx(minY, ppf) * scale,
    });
    setZoomLevel(Math.round(scale * 100));
  }, [size, ppf]);

  /**
   * Export the current floor as a PNG, clipped to the rooms' bounding box.
   *
   * Strategy: temporarily reconfigure the stage to scale=1 and position the
   * content at (PADDING, PADDING), resize the stage canvas to exactly fit the
   * content, call toDataURL(), then restore everything. This gives a clean
   * fixed-resolution export regardless of the current viewport zoom/pan.
   */
  const exportPng = useCallback((roomsToExport: Room[]) => {
    const stage = stageRef.current;
    if (!stage || roomsToExport.length === 0) return;

    const PADDING = 40; // px around content at scale=1

    // Content bounding box in Konva pixels at scale=1
    const minX = Math.min(...roomsToExport.map((r) => ftToPx(r.x, ppf)));
    const minY = Math.min(...roomsToExport.map((r) => ftToPx(r.y, ppf)));
    const maxX = Math.max(...roomsToExport.map((r) => ftToPx(r.x + r.w, ppf)));
    const maxY = Math.max(...roomsToExport.map((r) => ftToPx(r.y + r.h, ppf)));

    const exportW = Math.ceil(maxX - minX + PADDING * 2);
    const exportH = Math.ceil(maxY - minY + PADDING * 2);

    // Save current stage state
    const savedScale = stage.scaleX();
    const savedPos   = stage.position();
    const savedW     = stage.width();
    const savedH     = stage.height();

    // Reconfigure for export: 1:1 scale, content anchored at (PADDING, PADDING)
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: PADDING - minX, y: PADDING - minY });
    stage.width(exportW);
    stage.height(exportH);

    const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: 'image/png' });

    // Restore stage
    stage.scale({ x: savedScale, y: savedScale });
    stage.position(savedPos);
    stage.width(savedW);
    stage.height(savedH);

    // Trigger browser download
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'floorplan.png';
    link.click();
  }, [ppf]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') { setShiftHeld(true); return; }
      if (e.key === 'Alt')   { setAltHeld(true); e.preventDefault(); return; }
      // Overlays handle their own keys
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = useFloorPlanStore.getState().uiState.selectedIds;
        if (ids.length > 0) deleteRooms(ids);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault(); undo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault(); redo(); return;
      }
      if (e.key === 'Escape') {
        setPlacingOpening(null);
        setSelectedIds([]);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault(); resetZoom(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        fitToScreen(useFloorPlanStore.getState().rooms.filter(
          (r) => r.floor === useFloorPlanStore.getState().uiState.activeFloor
        ));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        exportPng(useFloorPlanStore.getState().rooms.filter(
          (r) => r.floor === useFloorPlanStore.getState().uiState.activeFloor
        ));
        return;
      }
      if (e.code === 'Space' && !isPanning.current) {
        e.preventDefault();
        isPanning.current = true;
        if (stageRef.current) {
          stageRef.current.draggable(true);
          stageRef.current.container().style.cursor = 'grab';
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') { setShiftHeld(false); }
      if (e.key === 'Alt')   { setAltHeld(false); }
      if (e.code === 'Space') {
        isPanning.current = false;
        if (stageRef.current) {
          stageRef.current.draggable(false);
          stageRef.current.container().style.cursor = 'default';
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [deleteRooms, setSelectedIds, setPlacingOpening, undo, redo, resetZoom, fitToScreen, exportPng]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    dismissOverlays();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer  = stage.getPointerPosition()!;
    const origin   = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const newScale  = Math.min(Math.max(oldScale * (1 + direction * 0.08), 0.1), 4);
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - origin.x * newScale,
      y: pointer.y - origin.y * newScale,
    });
    setZoomLevel(Math.round(newScale * 100));
  }, [dismissOverlays]);

  // ── Overlay positioning ───────────────────────────────────────────────────

  const getStageTransform = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    return { scale: stage.scaleX(), pos: stage.position() };
  };

  /** Floating resize overlay — centred on the room. */
  const getResizeOverlayStyle = (room: Room): React.CSSProperties => {
    const t = getStageTransform();
    if (!t) return { display: 'none' };
    const rx = t.pos.x + ftToPx(room.x, ppf) * t.scale;
    const ry = t.pos.y + ftToPx(room.y, ppf) * t.scale;
    const rw = ftToPx(room.w, ppf) * t.scale;
    const rh = ftToPx(room.h, ppf) * t.scale;
    const overlayW = 140;
    return {
      position: 'absolute',
      left: rx + rw / 2 - overlayW / 2,
      top:  ry + rh / 2 - 22,
      width: overlayW,
      zIndex: 10,
    };
  };

  /**
   * Floating rename overlay — sits where the label text lives.
   * Label Konva-Y = group.y + ph/2 − 18, converted to screen coords.
   */
  const getLabelOverlayStyle = (room: Room): React.CSSProperties => {
    const t = getStageTransform();
    if (!t) return { display: 'none' };
    const rx = t.pos.x + ftToPx(room.x, ppf) * t.scale;
    const ry = t.pos.y + ftToPx(room.y, ppf) * t.scale;
    const rw = ftToPx(room.w, ppf) * t.scale;
    const rh = ftToPx(room.h, ppf) * t.scale;
    // Mirror the Konva Text y: ph/2 − 18 (Konva px), scaled to screen px
    const labelScreenY = ry + (rh / 2 - 18 * t.scale);
    const inputW = Math.min(Math.max(rw, 100), 300);
    return {
      position: 'absolute',
      left: rx + (rw - inputW) / 2,
      top:  labelScreenY - 4,
      width: inputW,
      zIndex: 20,
    };
  };

  // ── Resize overlay handlers ───────────────────────────────────────────────

  const openResizeOverlay = useCallback((room: Room) => {
    setRenameMode(null);
    setResizeMode({ roomId: room.id, field: 'w', value: String(room.w) });
  }, []);

  const commitResize = useCallback(() => {
    setResizeMode((prev) => {
      if (!prev) return null;
      const v = parseFloat(prev.value);
      if (!isNaN(v) && v >= 0.5) updateRoom(prev.roomId, { [prev.field]: v });
      return null;
    });
  }, [updateRoom]);

  const handleResizeTab = useCallback(() => {
    setResizeMode((prev) => {
      if (!prev) return null;
      const v = parseFloat(prev.value);
      if (!isNaN(v) && v >= 0.5) updateRoom(prev.roomId, { [prev.field]: v });
      const nextField: 'w' | 'h' = prev.field === 'w' ? 'h' : 'w';
      const latestRoom = useFloorPlanStore.getState().rooms.find((r) => r.id === prev.roomId);
      return { ...prev, field: nextField, value: String(latestRoom?.[nextField] ?? '') };
    });
  }, [updateRoom]);

  // ── Rename overlay handlers ───────────────────────────────────────────────

  const openRenameOverlay = useCallback((room: Room) => {
    setResizeMode(null);
    setRenameMode({ roomId: room.id, value: room.label });
  }, []);

  const commitRename = useCallback(() => {
    setRenameMode((prev) => {
      if (!prev) return null;
      const label = prev.value.trim();
      if (label) renameRoom(prev.roomId, label);
      return null;
    });
  }, [renameRoom]);

  const cancelRename = useCallback(() => setRenameMode(null), []);

  // ── Click vs double-click disambiguation ──────────────────────────────────
  //
  // Single click → select room + open resize overlay (after 200 ms timer)
  // Double click → cancel the timer, open rename overlay instead
  //
  // This prevents the resize overlay from briefly flashing on double-click.

  const handleRoomClick = useCallback((room: Room, shiftKey: boolean) => {
    if (shiftKey) {
      // Shift+Click: immediately toggle room in/out of selection, no resize overlay
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      toggleSelectedId(room.id);
      return;
    }
    setSelectedIds([room.id]);
    if (clickTimerRef.current) return; // second click of a dbl-click — let dblClick handle it
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      openResizeOverlay(room);
    }, 200);
  }, [setSelectedIds, toggleSelectedId, openResizeOverlay]);

  const handleRoomDblClick = useCallback((room: Room) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setSelectedIds([room.id]);
    openRenameOverlay(room);
  }, [setSelectedIds, openRenameOverlay]);

  // ── Render ────────────────────────────────────────────────────────────────

  const activeRooms = rooms.filter((r) => r.floor === uiState.activeFloor);
  const resizeRoom  = resizeMode ? rooms.find((r) => r.id === resizeMode.roomId) : null;
  const renameRoom_ = renameMode ? rooms.find((r) => r.id === renameMode.roomId) : null;

  /**
   * Soft collisions: overlapping pairs that are NOT intentional cutter-parent
   * relationships. Recomputed only when active rooms change.
   */
  const softCollisions = useMemo(() => {
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    for (let i = 0; i < activeRooms.length; i++) {
      for (let j = i + 1; j < activeRooms.length; j++) {
        const a = activeRooms[i];
        const b = activeRooms[j];
        // Skip intentional cutter-parent pairs — they're supposed to overlap
        if (
          (a.isCutter && a.targetParent === b.id) ||
          (b.isCutter && b.targetParent === a.id)
        ) continue;
        // Skip pairs the user has chosen to layer (intentional overlap)
        if (suppressedCollisions.has([a.id, b.id].sort().join(':'))) continue;
        const rect = intersectionRect(a, b);
        if (rect) rects.push(rect);
      }
    }
    return rects;
  }, [activeRooms, suppressedCollisions]);

  // ── Conflict menu handlers ─────────────────────────────────────────────────

  const handleRoomContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>, room: Room) => {
      e.evt.preventDefault();
      e.cancelBubble = true;

      // Find the conflict partner with the largest overlap area on this floor
      const partner = activeRooms
        .filter((other) => {
          if (other.id === room.id) return false;
          if (
            (room.isCutter && room.targetParent === other.id) ||
            (other.isCutter && other.targetParent === room.id)
          ) return false;
          if (suppressedCollisions.has([room.id, other.id].sort().join(':'))) return false;
          return intersectionRect(room, other) !== null;
        })
        .sort((a, b) => {
          const areaA = intersectionArea(room, a);
          const areaB = intersectionArea(room, b);
          return areaB - areaA;
        })[0];

      if (!partner) return;

      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      setConflictMenu({ roomA: room, roomB: partner, screenX: pos.x, screenY: pos.y });
    },
    [activeRooms, suppressedCollisions]
  );

  const handleConflictCut = useCallback(() => {
    if (!conflictMenu) return;
    const { roomA, roomB } = conflictMenu;
    // Smaller room (by area) becomes the cutter
    const aArea = roomA.w * roomA.h;
    const bArea = roomB.w * roomB.h;
    if (aArea <= bArea) {
      updateRoom(roomA.id, { isCutter: true, targetParent: roomB.id });
    } else {
      updateRoom(roomB.id, { isCutter: true, targetParent: roomA.id });
    }
    setConflictMenu(null);
  }, [conflictMenu, updateRoom]);

  const handleConflictMerge = useCallback(() => {
    if (!conflictMenu) return;
    mergeRooms(conflictMenu.roomA.id, conflictMenu.roomB.id);
    setConflictMenu(null);
  }, [conflictMenu, mergeRooms]);

  const handleConflictLayer = useCallback(() => {
    if (!conflictMenu) return;
    suppressCollision(conflictMenu.roomA.id, conflictMenu.roomB.id);
    setConflictMenu(null);
  }, [conflictMenu, suppressCollision]);

  return (
    <div ref={containerRef} className={`relative w-full h-full bg-gray-100 ${placingOpening ? 'cursor-crosshair' : shiftHeld ? 'cursor-crosshair' : altHeld ? 'cursor-move' : 'cursor-default'}`}>
      {/* Stamp Mode indicator */}
      {shiftHeld && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-md pointer-events-none select-none">
          ✂ Stamp Mode — drag a room onto another to make it a cutter
        </div>
      )}

      {/* Placement mode indicator */}
      {placingOpening && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-md pointer-events-none select-none">
          {placingOpening === 'door' ? 'Door' : 'Window'} — click a wall edge to place &nbsp;·&nbsp; Esc to cancel
        </div>
      )}

      {/* Sticky Push indicator */}
      {altHeld && !shiftHeld && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-green-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-md pointer-events-none select-none">
          ↔ Sticky Push — drag to push touching rooms
        </div>
      )}

      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={handleWheel}
        onDragStart={dismissOverlays}
        onClick={(e) => {
          if (e.target === e.target.getStage()) {
            setPlacingOpening(null);
            setSelectedIds([]);
            dismissOverlays();
          }
        }}
        onMouseDown={(e) => {
          // Rubber-band: only on empty canvas, not while panning
          if (e.target !== e.target.getStage()) return;
          if (isPanning.current) return;
          const pos = stageRef.current?.getRelativePointerPosition();
          if (!pos) return;
          setRubberBand({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
        }}
        onMouseMove={() => {
          if (!rubberBand) return;
          const pos = stageRef.current?.getRelativePointerPosition();
          if (!pos) return;
          setRubberBand((prev) => prev ? { ...prev, x1: pos.x, y1: pos.y } : null);
        }}
        onMouseUp={() => {
          if (!rubberBand) return;
          const minX = Math.min(rubberBand.x0, rubberBand.x1) / ppf;
          const maxX = Math.max(rubberBand.x0, rubberBand.x1) / ppf;
          const minY = Math.min(rubberBand.y0, rubberBand.y1) / ppf;
          const maxY = Math.max(rubberBand.y0, rubberBand.y1) / ppf;
          const selected = activeRooms
            .filter((r) => r.x >= minX && r.x + r.w <= maxX && r.y >= minY && r.y + r.h <= maxY)
            .map((r) => r.id);
          if (selected.length > 0) setSelectedIds(selected);
          setRubberBand(null);
        }}
      >
        <Layer>
          {activeRooms.map((room) => {
            const px = ftToPx(room.x, ppf);
            const py = ftToPx(room.y, ppf);
            const pw = ftToPx(room.w, ppf);
            const ph = ftToPx(room.h, ppf);
            const netArea    = getNetArea(room.id);
            const isSelected = selectedIds.includes(room.id);
            const isResizing = resizeMode?.roomId === room.id;
            const isRenaming = renameMode?.roomId === room.id;

            return (
              <Group
                key={room.id}
                x={px}
                y={py}
                draggable={!placingOpening}
                onClick={(e) => {
                  e.cancelBubble = true;
                  if (placingOpening) {
                    const pos = (e.currentTarget as Konva.Group).getRelativePointerPosition();
                    if (!pos) { setPlacingOpening(null); return; }
                    const edge = detectEdge(pos.x, pos.y, pw, ph);
                    if (edge) {
                      const edgeLenFt = edge === 'top' || edge === 'bottom' ? room.w : room.h;
                      const defaultW = Math.min(3, edgeLenFt);
                      const rawOffset = edgeOffsetFt(edge, pos.x, pos.y, ppf);
                      const snapped = Math.max(
                        0,
                        Math.min(
                          snapToGrid(rawOffset - defaultW / 2, gridSnap),
                          edgeLenFt - defaultW,
                        ),
                      );
                      addOpening(room.id, { type: placingOpening, edge, offset: snapped, w: defaultW });
                    }
                    setPlacingOpening(null);
                    return;
                  }
                  handleRoomClick(room, e.evt.shiftKey);
                }}
                onDblClick={(e) => { e.cancelBubble = true; handleRoomDblClick(room); }}
                onContextMenu={(e) => handleRoomContextMenu(e as Konva.KonvaEventObject<PointerEvent>, room)}
                onDragStart={dismissOverlays}
                onDragEnd={(e) => {
                  const snappedX = snapToGrid(pxToFt(e.target.x(), ppf), gridSnap);
                  const snappedY = snapToGrid(pxToFt(e.target.y(), ppf), gridSnap);

                  if (e.evt.shiftKey) {
                    // Stamp Mode: auto-assign as cutter to the best overlapping parent
                    const allRooms = useFloorPlanStore.getState().rooms;
                    const droppedRoom = { ...room, x: snappedX, y: snappedY };
                    const bestParent = allRooms
                      .filter(
                        (r) =>
                          r.id !== room.id &&
                          !r.isCutter &&
                          r.floor === uiState.activeFloor
                      )
                      .reduce<{ id: string | null; area: number }>(
                        (best, r) => {
                          const area = intersectionArea(droppedRoom, r);
                          return area > best.area ? { id: r.id, area } : best;
                        },
                        { id: null, area: 0 }
                      );

                    updateRoom(room.id, {
                      x: snappedX,
                      y: snappedY,
                      ...(bestParent.id !== null
                        ? { isCutter: true, targetParent: bestParent.id }
                        : {}),
                    });
                  } else if (e.evt.altKey) {
                    // Sticky Push: BFS — carry all edge-touching neighbors in the drag direction
                    const latestRooms = useFloorPlanStore.getState().rooms;
                    const origRoom = latestRooms.find((r) => r.id === room.id)!;
                    const dx = snappedX - origRoom.x;
                    const dy = snappedY - origRoom.y;

                    if (dx === 0 && dy === 0) return;

                    const floorRooms = latestRooms.filter((r) => r.floor === uiState.activeFloor);
                    const displaced = new Map<string, { x: number; y: number }>();
                    displaced.set(room.id, { x: snappedX, y: snappedY });
                    const queue: string[] = [room.id];

                    while (queue.length > 0) {
                      const currentId = queue.shift()!;
                      const currentRoom = floorRooms.find((r) => r.id === currentId)!;
                      const candidates = floorRooms.filter((r) => !displaced.has(r.id));
                      for (const neighbor of touchingInDirection(currentRoom, candidates, dx, dy)) {
                        displaced.set(neighbor.id, { x: neighbor.x + dx, y: neighbor.y + dy });
                        queue.push(neighbor.id);
                      }
                    }

                    batchMoveRooms(
                      Array.from(displaced.entries()).map(([id, pos]) => ({ id, ...pos }))
                    );
                  } else {
                    // Normal move — if multiple rooms are selected, drag them all together
                    const latestRooms = useFloorPlanStore.getState().rooms;
                    const origRoom = latestRooms.find((r) => r.id === room.id)!;
                    const dx = snappedX - origRoom.x;
                    const dy = snappedY - origRoom.y;
                    const currentSelectedIds = useFloorPlanStore.getState().uiState.selectedIds;

                    if (currentSelectedIds.includes(room.id) && currentSelectedIds.length > 1) {
                      batchMoveRooms(
                        currentSelectedIds.map((id) => {
                          const r = latestRooms.find((r) => r.id === id)!;
                          return { id, x: r.x + dx, y: r.y + dy };
                        })
                      );
                    } else {
                      updateRoom(room.id, { x: snappedX, y: snappedY });
                    }
                  }
                }}
              >
                {/* Room fill */}
                <Rect width={pw} height={ph} fill={room.color} listening={false} />

                {/* Walls with gaps at openings */}
                {buildWallShapes(
                  room, pw, ph, ppf,
                  room.isCutter ? '#f59e0b' : '#374151',
                  room.isCutter ? 2 : 1.5,
                  room.isCutter ? [4, 4] : undefined,
                )}

                {/* Selection / edit highlight (stroke only, no fill) */}
                <Rect
                  width={pw} height={ph} fill="transparent"
                  stroke={
                    isRenaming || isResizing ? '#7c3aed'
                    : isSelected             ? '#2563eb'
                    : undefined
                  }
                  strokeWidth={isSelected || isRenaming || isResizing ? 2 : 0}
                  dash={isResizing || isRenaming ? [6, 3] : undefined}
                  shadowColor={isSelected && !isResizing && !isRenaming ? '#2563eb' : undefined}
                  shadowBlur={isSelected && !isResizing && !isRenaming ? 6 : 0}
                  shadowOpacity={0.3}
                  listening={false}
                />
                {/* Hide label while renaming; hide both while resizing */}
                {!isResizing && !isRenaming && (
                  <Text
                    text={room.label}
                    width={pw}
                    align="center"
                    y={ph / 2 - (uiState.showNetArea ? 18 : 9)}
                    fontSize={13}
                    fontStyle="bold"
                    fill="#111827"
                    listening={false}
                  />
                )}
                {!isResizing && !isRenaming && uiState.showNetArea && (
                  <Text
                    text={`${netArea.toFixed(1)} ft²`}
                    width={pw}
                    align="center"
                    y={ph / 2 + 2}
                    fontSize={11}
                    fill="#6b7280"
                    listening={false}
                  />
                )}
              </Group>
            );
          })}
        </Layer>

        {/* Collision overlay layer — rendered above rooms so it's always visible */}
        <Layer listening={false}>
          {softCollisions.map((rect, i) => (
            <Rect
              key={`collision-${i}`}
              x={ftToPx(rect.x, ppf)}
              y={ftToPx(rect.y, ppf)}
              width={ftToPx(rect.w, ppf)}
              height={ftToPx(rect.h, ppf)}
              fill="rgba(239, 68, 68, 0.25)"
              stroke="#ef4444"
              strokeWidth={1.5}
            />
          ))}

          {/* Rubber-band selection rect */}
          {rubberBand && (
            <Rect
              x={Math.min(rubberBand.x0, rubberBand.x1)}
              y={Math.min(rubberBand.y0, rubberBand.y1)}
              width={Math.abs(rubberBand.x1 - rubberBand.x0)}
              height={Math.abs(rubberBand.y1 - rubberBand.y0)}
              fill="rgba(59, 130, 246, 0.08)"
              stroke="#3b82f6"
              strokeWidth={1}
              dash={[4, 3]}
            />
          )}
        </Layer>
      </Stage>

      {/* Resize overlay */}
      {resizeMode && resizeRoom && (
        <ResizeInput
          field={resizeMode.field}
          value={resizeMode.value}
          style={getResizeOverlayStyle(resizeRoom)}
          onChange={(val) => setResizeMode((prev) => prev ? { ...prev, value: val } : null)}
          onCommit={commitResize}
          onCancel={() => setResizeMode(null)}
          onTab={handleResizeTab}
        />
      )}

      {/* Rename overlay */}
      {renameMode && renameRoom_ && (
        <LabelInput
          value={renameMode.value}
          style={getLabelOverlayStyle(renameRoom_)}
          onChange={(val) => setRenameMode((prev) => prev ? { ...prev, value: val } : null)}
          onCommit={commitRename}
          onCancel={cancelRename}
        />
      )}

      {/* Conflict menu */}
      {conflictMenu && (
        <ConflictMenu
          roomA={conflictMenu.roomA}
          roomB={conflictMenu.roomB}
          screenX={conflictMenu.screenX}
          screenY={conflictMenu.screenY}
          onCut={handleConflictCut}
          onMerge={handleConflictMerge}
          onLayer={handleConflictLayer}
          onDismiss={() => setConflictMenu(null)}
        />
      )}

      {/* Toolbar — bottom-right corner */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white rounded-lg shadow-md border border-gray-200 px-1.5 py-1 z-10 select-none">
        {/* Snapshot / PNG export */}
        <button
          title="Export PNG (Ctrl+E)"
          onClick={() => exportPng(activeRooms)}
          disabled={activeRooms.length === 0}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="12" height="9" rx="1" />
            <circle cx="7" cy="7.5" r="2" />
            <path d="M4.5 3V2.5A.5.5 0 0 1 5 2h4a.5.5 0 0 1 .5.5V3" />
          </svg>
        </button>

        <div className="w-px h-4 bg-gray-200 mx-0.5" />

        {/* Fit to screen */}
        <button
          title="Fit to screen (Ctrl+Shift+F)"
          onClick={() => fitToScreen(activeRooms)}
          disabled={activeRooms.length === 0}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
          </svg>
        </button>

        <span className="text-xs text-gray-500 tabular-nums w-9 text-center">
          {zoomLevel}%
        </span>

        {/* Reset zoom */}
        <button
          title="Reset zoom to 100% (Ctrl+0)"
          onClick={resetZoom}
          className="px-1.5 py-0.5 rounded hover:bg-gray-100 text-xs font-medium text-gray-600 transition-colors"
        >
          1:1
        </button>
      </div>
    </div>
  );
}
