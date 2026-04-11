import { useRef, useEffect } from 'react';

interface ResizeInputProps {
  field: 'w' | 'h';
  value: string;
  style: React.CSSProperties;
  onChange: (val: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onTab: () => void;
}

/**
 * HTML input overlay that floats on top of the Konva canvas.
 * Positioned via absolute CSS using coordinates derived from the stage transform.
 *
 * Tab behaviour: e.preventDefault() on Tab prevents blur from firing,
 * so onTab() can switch the field without onCommit() triggering mid-switch.
 */
export function ResizeInput({ field, value, style, onChange, onCommit, onCancel, onTab }: ResizeInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  // Re-focus and select text whenever the active field switches (W ↔ H)
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, [field]);

  return (
    <div style={style} className="pointer-events-auto select-none">
      <div className="flex items-center gap-1.5 bg-white rounded-lg shadow-xl border-2 border-blue-500 px-2 py-1.5">
        <input
          ref={ref}
          type="number"
          step={0.5}
          min={0.5}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab')    { e.preventDefault(); onTab();    }
            if (e.key === 'Enter')  { e.preventDefault(); onCommit(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          }}
          onBlur={onCommit}
          className="w-16 text-sm text-center font-mono tabular-nums outline-none"
        />
        <span className="text-xs font-bold text-blue-500 w-6 text-left">
          {field === 'w' ? 'W' : 'H'}
        </span>
      </div>
      <p className="text-[10px] text-center text-gray-400 mt-0.5 leading-none">
        Tab ↔  ·  Enter ✓  ·  Esc ✗
      </p>
    </div>
  );
}
