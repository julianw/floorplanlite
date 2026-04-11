import { useRef } from 'react';
import { useFloorPlanStore } from '../../store/useFloorPlanStore';

export function Sidebar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    rooms, uiState, canvas,
    addRoom, updateRoom, renameRoom, deleteRoom,
    setSelectedId, undo, redo,
    exportJson, importJson, getNetArea,
  } = useFloorPlanStore();

  const selected = rooms.find((r) => r.id === uiState.selectedId);
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
                uiState: { ...s.uiState, activeFloor: floor, selectedId: null },
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
              uiState.selectedId === room.id
                ? 'bg-blue-50 text-blue-900'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setSelectedId(room.id)}
          >
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0 border border-gray-300"
              style={{ background: room.color }}
            />
            <span className="truncate">{room.label}</span>
          </button>
        ))}
      </div>

      {/* Properties panel — shown when a room is selected */}
      {selected && (
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
