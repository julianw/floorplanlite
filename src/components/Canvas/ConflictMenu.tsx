import { useEffect, useRef } from 'react';
import type { Room } from '../../types';

interface ConflictMenuProps {
  roomA: Room;
  roomB: Room;
  screenX: number;
  screenY: number;
  onCut: () => void;
  onMerge: () => void;
  onLayer: () => void;
  onDismiss: () => void;
}

/**
 * Floating popup that offers three ways to resolve a room collision:
 *   Cut   — smaller room becomes a cutter of the larger
 *   Merge — combine both rooms into one bounding-box union
 *   Layer — suppress the warning (intentional overlap)
 */
export function ConflictMenu({
  roomA, roomB, screenX, screenY,
  onCut, onMerge, onLayer, onDismiss,
}: ConflictMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  // Clamp menu position so it doesn't overflow off-screen
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { innerWidth, innerHeight } = window;
    const rect = el.getBoundingClientRect();
    if (rect.right  > innerWidth)  el.style.left = `${screenX - el.offsetWidth  - 8}px`;
    if (rect.bottom > innerHeight) el.style.top  = `${screenY - el.offsetHeight - 8}px`;
  }, [screenX, screenY]);

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-30" onClick={onDismiss} />

      <div
        ref={menuRef}
        className="absolute z-40 bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-52"
        style={{ left: screenX + 8, top: screenY + 8 }}
      >
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          Resolve conflict
        </p>
        <p className="text-xs text-gray-500 mb-3 leading-snug">
          <span className="font-medium text-gray-700">{roomA.label}</span>
          {' '}overlaps{' '}
          <span className="font-medium text-gray-700">{roomB.label}</span>
        </p>

        <div className="space-y-1.5">
          {/* Cut */}
          <button
            onClick={onCut}
            className="w-full text-left px-2.5 py-2 text-xs rounded-md hover:bg-amber-50 border border-amber-200 flex items-start gap-2.5 transition-colors"
          >
            <span className="text-amber-600 mt-px">✂</span>
            <div>
              <div className="font-semibold text-amber-800">Cut</div>
              <div className="text-[10px] text-amber-600 mt-0.5">
                Smaller room subtracts from the larger
              </div>
            </div>
          </button>

          {/* Merge */}
          <button
            onClick={onMerge}
            className="w-full text-left px-2.5 py-2 text-xs rounded-md hover:bg-blue-50 border border-blue-200 flex items-start gap-2.5 transition-colors"
          >
            <span className="text-blue-600 mt-px font-bold">⊞</span>
            <div>
              <div className="font-semibold text-blue-800">Merge</div>
              <div className="text-[10px] text-blue-600 mt-0.5">
                Combine into one bounding-box room
              </div>
            </div>
          </button>

          {/* Layer */}
          <button
            onClick={onLayer}
            className="w-full text-left px-2.5 py-2 text-xs rounded-md hover:bg-gray-50 border border-gray-200 flex items-start gap-2.5 transition-colors"
          >
            <span className="text-gray-500 mt-px">☰</span>
            <div>
              <div className="font-semibold text-gray-700">Layer</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Intentional overlap — hide warning
              </div>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
