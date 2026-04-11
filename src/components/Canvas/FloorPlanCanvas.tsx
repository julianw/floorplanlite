import { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Group } from 'react-konva';
import type Konva from 'konva';
import { useFloorPlanStore } from '../../store/useFloorPlanStore';
import { ftToPx, pxToFt, snapToGrid } from '../../engine/geometry';

export function FloorPlanCanvas() {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 100, height: 100 });
  const isPanning = useRef(false);

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
      // Don't intercept when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (uiState.selectedId) deleteRoom(uiState.selectedId);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        return;
      }
      // Space → pan mode
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

  // ── Render rooms ──────────────────────────────────────────────────────────

  const activeRooms = rooms.filter((r) => r.floor === uiState.activeFloor);

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-100 cursor-default">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={handleWheel}
        onClick={(e) => {
          // Deselect when clicking the empty canvas
          if (e.target === e.target.getStage()) setSelectedId(null);
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

            return (
              <Group
                key={room.id}
                x={px}
                y={py}
                draggable
                onClick={(e) => {
                  e.cancelBubble = true;
                  setSelectedId(room.id);
                }}
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
                  stroke={isSelected ? '#2563eb' : '#6b7280'}
                  strokeWidth={isSelected ? 2 : 1}
                  shadowColor={isSelected ? '#2563eb' : undefined}
                  shadowBlur={isSelected ? 6 : 0}
                  shadowOpacity={0.3}
                />
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
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
