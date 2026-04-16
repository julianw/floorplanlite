import { useRef } from 'react';
import { useFloorPlanStore } from '../../store/useFloorPlanStore';
import { isOverlapping } from '../../engine/geometry';

export function Sidebar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    rooms, uiState, canvas,
    addRoom, updateRoom, renameRoom, deleteRoom, deleteRooms,
    setSelectedIds, toggleSelectedId, undo, redo,
    exportJson, importJson, getNetArea,
  } = useFloorPlanStore();

  const { selectedIds } = uiState;
  const primaryId = selectedIds[0] ?? null;
  const selected = rooms.find((r) => r.id === primaryId);
  const activeRooms = rooms.filter((r) => r.floor === uiState.activeFloor);

  // ── Save / Open ───────────────────────────────────────────────────────────

  const handleSave = () => {
    const json = exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floorplan.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') importJson(ev.target.result);
    };
    reader.readAsText(file);
    // Reset so the same file can be re-opened
    e.target.value = '';
  };

  return (
    <aside className="w-60 h-screen bg-white border-r border-gray-200 flex flex-col select-none">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h1 className="text-base font-bold text-gray-900 tracking-tight">FloorPlanLite</h1>
      </div>

      {/* Floor tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {canvas.floors.map((floor) => (
          <button
            key={floor}
            className={`flex-shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              uiState.activeFloor === floor
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() =>
              useFloorPlanStore.setState((s) => ({
                uiState: { ...s.uiState, activeFloor: floor, selectedIds: [] },
              }))
            }
          >
            {floor}
          </button>
        ))}
      </div>

      {/* Add Room */}
      <div className="px-4 py-3 border-b border-gray-200">
        <button
          className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
          onClick={() => addRoom()}
        >
          + Add Room
        </button>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">
          Rooms ({activeRooms.length})
        </p>
        {activeRooms.length === 0 && (
          <p className="text-xs text-gray-400 px-1">No rooms yet. Click "+ Add Room".</p>
        )}
        {activeRooms.map((room) => (
          <button
            key={room.id}
            className={`w-full text-left px-2.5 py-1.5 rounded-md mb-0.5 text-sm flex items-center gap-2 transition-colors ${
              selectedIds.includes(room.id)
                ? 'bg-blue-50 text-blue-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            onClick={(e) => e.shiftKey ? toggleSelectedId(room.id) : setSelectedIds([room.id])}
          >
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0 border border-gray-300"
              style={{ background: room.color }}
            />
            <span className="truncate flex-1">{room.label}</span>
            {room.isCutter && (
              <span className="text-[10px] font-medium text-amber-600 flex-shrink-0">✂</span>
            )}
          </button>
        ))}
      </div>

      {/* Multi-select banner — shown when 2+ rooms are selected */}
      {selectedIds.length > 1 && (
        <div className="border-t border-gray-200 px-4 py-3 space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Selection
          </p>
          <p className="text-xs text-gray-600">
            <span className="font-semibold text-gray-800">{selectedIds.length}</span> rooms selected
          </p>
          <button
            className="w-full py-1 text-xs text-red-600 hover:bg-red-50 rounded-md border border-red-200 transition-colors"
            onClick={() => deleteRooms(selectedIds)}
          >
            Delete {selectedIds.length} rooms
          </button>
        </div>
      )}

      {/* Properties panel — shown when exactly one room is selected */}
      {selected && selectedIds.length === 1 && (
        <div className="border-t border-gray-200 px-4 py-3 space-y-2.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Properties
          </p>

          {/* Label */}
          <label className="block">
            <span className="text-xs text-gray-500">Label</span>
            <input
              className="mt-0.5 w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={selected.label}
              onChange={(e) => renameRoom(selected.id, e.target.value)}
            />
          </label>

          {/* Width / Height */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-gray-500">W (ft)</span>
              <input
                type="number"
                step={canvas.gridSnap}
                min={canvas.gridSnap}
                className="mt-0.5 w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={selected.w}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) updateRoom(selected.id, { w: v });
                }}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">H (ft)</span>
              <input
                type="number"
                step={canvas.gridSnap}
                min={canvas.gridSnap}
                className="mt-0.5 w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={selected.h}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) updateRoom(selected.id, { h: v });
                }}
              />
            </label>
          </div>

          {/* Net area */}
          <p className="text-xs text-gray-500">
            Net area:{' '}
            <span className="font-semibold text-gray-700">
              {getNetArea(selected.id).toFixed(1)} ft²
            </span>
          </p>

          {/* ── Cutter toggle ── */}
          <div className="border-t border-gray-100 pt-2.5 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.isCutter}
                onChange={(e) => {
                  const enabling = e.target.checked;
                  // When enabling, auto-select a parent if exactly one room overlaps
                  const autoParent = enabling
                    ? rooms.find(
                        (r) =>
                          r.id !== selected.id &&
                          !r.isCutter &&
                          r.floor === uiState.activeFloor &&
                          isOverlapping(r, selected)
                      )?.id ?? null
                    : null;
                  updateRoom(selected.id, {
                    isCutter: enabling,
                    targetParent: autoParent,
                  });
                }}
                className="rounded"
              />
              <span className="text-xs font-medium text-amber-700">Is Cutter</span>
            </label>

            {selected.isCutter && (
              <label className="block">
                <span className="text-xs text-gray-500">Cuts into</span>
                <select
                  className="mt-0.5 w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500"
                  value={selected.targetParent ?? ''}
                  onChange={(e) =>
                    updateRoom(selected.id, { targetParent: e.target.value || null })
                  }
                >
                  <option value="">— select parent —</option>
                  {rooms
                    .filter(
                      (r) =>
                        r.id !== selected.id &&
                        !r.isCutter &&
                        r.floor === uiState.activeFloor
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                </select>
                {selected.targetParent && (
                  <p className="mt-1 text-[10px] text-amber-600">
                    Subtracts{' '}
                    <span className="font-semibold">
                      {(selected.w * selected.h).toFixed(1)} ft²
                    </span>{' '}
                    from{' '}
                    {rooms.find((r) => r.id === selected.targetParent)?.label ?? 'parent'}
                  </p>
                )}
              </label>
            )}
          </div>

          {/* Delete */}
          <button
            className="w-full py-1 text-xs text-red-600 hover:bg-red-50 rounded-md border border-red-200 transition-colors"
            onClick={() => deleteRoom(selected.id)}
          >
            Delete room
          </button>
        </div>
      )}


      {/* Footer — file actions + undo/redo */}
      <div className="border-t border-gray-200 px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <button
            title="Undo (Ctrl+Z)"
            className="flex-1 py-1 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            onClick={undo}
          >
            ↩ Undo
          </button>
          <button
            title="Redo (Ctrl+Y)"
            className="flex-1 py-1 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            onClick={redo}
          >
            ↪ Redo
          </button>
        </div>
        <div className="flex gap-2">
          <button
            className="flex-1 py-1 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            onClick={handleSave}
          >
            Save JSON
          </button>
          <button
            className="flex-1 py-1 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            Open JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleOpen}
          />
        </div>
      </div>
    </aside>
  );
}
