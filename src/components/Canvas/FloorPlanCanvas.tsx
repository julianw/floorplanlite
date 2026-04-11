import { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Group } from 'react-konva';
import type Konva from 'konva';
import { useFloorPlanStore } from '../../store/useFloorPlanStore';
import { ftToPx, pxToFt, snapToGrid } from '../../engine/geometry';
import { ResizeInput } from './ResizeInput';
import type { Room } from '../../types';

// ── Resize overlay state ──────────────────────────────────────────────────────

interface ResizeMode {
  roomId: string;
  field: 'w' | 'h';
  value: string; // raw string so the input isn't disrupted while typing
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FloorPlanCanvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 100, height: 100 });
  const isPanning = useRef(false);
  const [resizeMode, setResizeMode] = useState<ResizeMode | null>(null);

  const {
    rooms, uiState, canvas,
    updateRoom, deleteRoom, setSelectedId,
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
      // Resize input handles its own keys; don't intercept
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
  }, [uiState.selectedId, deleteRoom, setSelectedId, undo, redo]);

  // ── Zoom on scroll ────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    setResizeMode(null); // close overlay when zooming — position would drift
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition()!;
    const origin = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(Math.max(oldScale * (1 + direction * 0.08), 0.1), 4);
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - origin.x * newScale,
      y: pointer.y - origin.y * newScale,
    });
  }, []);

  // ── Resize overlay helpers ────────────────────────────────────────────────

  /**
   * Compute the CSS position of the overlay relative to the container div,
   * accounting for the stage's current pan and zoom transform.
   */
  const getOverlayStyle = (room: Room): React.CSSProperties => {
    const stage = stageRef.current;
    if (!stage) return { display: 'none' };
    const scale = stage.scaleX();
    const pos = stage.position();
    const rx = pos.x + ftToPx(room.x, ppf) * scale;
    const ry = pos.y + ftToPx(room.y, ppf) * scale;
    const rw = ftToPx(room.w, ppf) * scale;
    const rh = ftToPx(room.h, ppf) * scale;
    const overlayW = 140;
    return {
      position: 'absolute',
      left: rx + rw / 2 - overlayW / 2,
      top: ry + rh / 2 - 22,
      width: overlayW,
      zIndex: 10,
    };
  };

  const commitResize = useCallback(() => {
    setResizeMode((prev) => {
      if (!prev) return null;
      const v = parseFloat(prev.value);
      if (!isNaN(v) && v >= 0.5) {
        updateRoom(prev.roomId, { [prev.field]: v });
      }
      return null;
    });
  }, [updateRoom]);

  const cancelResize = useCallback(() => setResizeMode(null), []);

  /** Commit the current field and switch to the other one (W ↔ H). */
  const handleTab = useCallback(() => {
    setResizeMode((prev) => {
      if (!prev) return null;
      const v = parseFloat(prev.value);
      if (!isNaN(v) && v >= 0.5) {
        updateRoom(prev.roomId, { [prev.field]: v });
      }
      const nextField: 'w' | 'h' = prev.field === 'w' ? 'h' : 'w';
      // Read the latest value from the store (Zustand updates synchronously)
      const latestRoom = useFloorPlanStore.getState().rooms.find((r) => r.id === prev.roomId);
      return {
        ...prev,
        field: nextField,
        value: String(latestRoom?.[nextField] ?? ''),
      };
    });
  }, [updateRoom]);

  const openResizeOverlay = (room: Room) => {
    setResizeMode({ roomId: room.id, field: 'w', value: String(room.w) });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const activeRooms = rooms.filter((r) => r.floor === uiState.activeFloor);
  const resizeRoom = resizeMode ? rooms.find((r) => r.id === resizeMode.roomId) : null;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-100 cursor-default">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={handleWheel}
        onDragStart={() => setResizeMode(null)}
        onClick={(e) => {
          if (e.target === e.target.getStage()) {
            setSelectedId(null);
            setResizeMode(null);
          }
        }}
      >
        <Layer>
          {activeRooms.map((room) => {
            const px = ftToPx(room.x, ppf);
            const py = ftToPx(room.y, ppf);
            const pw = ftToPx(room.w, ppf);
            const ph = ftToPx(room.h, ppf);
            const netArea = getNetArea(room.id);
            const isSelected = uiState.selectedId === room.id;
            const isResizing = resizeMode?.roomId === room.id;

            return (
              <Group
                key={room.id}
                x={px}
                y={py}
                draggable
                onClick={(e) => {
                  e.cancelBubble = true;
                  setSelectedId(room.id);
                  openResizeOverlay(room);
                }}
                onDragStart={() => setResizeMode(null)}
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
                  stroke={isResizing ? '#7c3aed' : isSelected ? '#2563eb' : '#6b7280'}
                  strokeWidth={isResizing || isSelected ? 2 : 1}
                  dash={isResizing ? [6, 3] : undefined}
                  shadowColor={isSelected ? '#2563eb' : undefined}
                  shadowBlur={isSelected ? 6 : 0}
                  shadowOpacity={0.3}
                />
                {/* Hide label/area text while resize overlay is active to reduce clutter */}
                {!isResizing && (
                  <>
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
                    {uiState.showNetArea && (
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
                  </>
                )}
              </Group>
            );
          })}
        </Layer>
      </Stage>

      {/* Resize input overlay — floats over the canvas using absolute positioning */}
      {resizeMode && resizeRoom && (
        <ResizeInput
          field={resizeMode.field}
          value={resizeMode.value}
          style={getOverlayStyle(resizeRoom)}
          onChange={(val) => setResizeMode((prev) => prev ? { ...prev, value: val } : null)}
          onCommit={commitResize}
          onCancel={cancelResize}
          onTab={handleTab}
        />
      )}
    </div>
  );
}
