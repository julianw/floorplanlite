import { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Group } from 'react-konva';
import type Konva from 'konva';
import { useFloorPlanStore } from '../../store/useFloorPlanStore';
import { ftToPx, pxToFt, snapToGrid } from '../../engine/geometry';
import { ResizeInput } from './ResizeInput';
import { LabelInput } from './LabelInput';
import type { Room } from '../../types';

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

  const {
    rooms, uiState, canvas,
    updateRoom, renameRoom, deleteRoom, setSelectedId,
    undo, redo, getNetArea,
  } = useFloorPlanStore();

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

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Overlays handle their own keys
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (uiState.selectedId) deleteRoom(uiState.selectedId);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault(); undo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault(); redo(); return;
      }
      if (e.key === 'Escape') {
        setSelectedId(null); return;
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
  }, [uiState.selectedId, deleteRoom, setSelectedId, undo, redo, resetZoom, fitToScreen]);

  // ── Zoom helpers ──────────────────────────────────────────────────────────

  const dismissOverlays = useCallback(() => {
    setResizeMode(null);
    setRenameMode(null);
  }, []);

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

  const handleRoomClick = useCallback((room: Room) => {
    setSelectedId(room.id);
    if (clickTimerRef.current) return; // second click of a dbl-click — let dblClick handle it
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      openResizeOverlay(room);
    }, 200);
  }, [setSelectedId, openResizeOverlay]);

  const handleRoomDblClick = useCallback((room: Room) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setSelectedId(room.id);
    openRenameOverlay(room);
  }, [setSelectedId, openRenameOverlay]);

  // ── Render ────────────────────────────────────────────────────────────────

  const activeRooms = rooms.filter((r) => r.floor === uiState.activeFloor);
  const resizeRoom  = resizeMode ? rooms.find((r) => r.id === resizeMode.roomId) : null;
  const renameRoom_ = renameMode ? rooms.find((r) => r.id === renameMode.roomId) : null;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-100 cursor-default">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={handleWheel}
        onDragStart={dismissOverlays}
        onClick={(e) => {
          if (e.target === e.target.getStage()) {
            setSelectedId(null);
            dismissOverlays();
          }
        }}
      >
        <Layer>
          {activeRooms.map((room) => {
            const px = ftToPx(room.x, ppf);
            const py = ftToPx(room.y, ppf);
            const pw = ftToPx(room.w, ppf);
            const ph = ftToPx(room.h, ppf);
            const netArea    = getNetArea(room.id);
            const isSelected = uiState.selectedId === room.id;
            const isResizing = resizeMode?.roomId === room.id;
            const isRenaming = renameMode?.roomId === room.id;

            return (
              <Group
                key={room.id}
                x={px}
                y={py}
                draggable
                onClick={(e) => { e.cancelBubble = true; handleRoomClick(room); }}
                onDblClick={(e) => { e.cancelBubble = true; handleRoomDblClick(room); }}
                onDragStart={dismissOverlays}
                onDragEnd={(e) => {
                  updateRoom(room.id, {
                    x: snapToGrid(pxToFt(e.target.x(), ppf), gridSnap),
                    y: snapToGrid(pxToFt(e.target.y(), ppf), gridSnap),
                  });
                }}
              >
                <Rect
                  width={pw}
                  height={ph}
                  fill={room.color}
                  stroke={isRenaming ? '#7c3aed' : isResizing ? '#7c3aed' : isSelected ? '#2563eb' : '#6b7280'}
                  strokeWidth={isRenaming || isResizing || isSelected ? 2 : 1}
                  dash={isResizing || isRenaming ? [6, 3] : undefined}
                  shadowColor={isSelected && !isResizing && !isRenaming ? '#2563eb' : undefined}
                  shadowBlur={isSelected && !isResizing && !isRenaming ? 6 : 0}
                  shadowOpacity={0.3}
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

      {/* Zoom toolbar — bottom-right corner */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white rounded-lg shadow-md border border-gray-200 px-1.5 py-1 z-10 select-none">
        <button
          title="Fit to screen (Ctrl+Shift+F)"
          onClick={() => fitToScreen(activeRooms)}
          disabled={activeRooms.length === 0}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600 transition-colors"
        >
          {/* Fit icon: four inward-pointing arrows */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
          </svg>
        </button>

        <span className="text-xs text-gray-500 tabular-nums w-9 text-center">
          {zoomLevel}%
        </span>

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
