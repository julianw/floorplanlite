import { useRef, useEffect } from 'react';

interface LabelInputProps {
  value: string;
  style: React.CSSProperties;
  onChange: (val: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

/**
 * Text input overlay for renaming a room label directly on the canvas.
 * Positioned via absolute CSS using coordinates derived from the stage transform.
 *
 * Auto-focuses and selects all text on mount so the user can type immediately.
 * Blur commits (same as Enter) so clicking away saves the rename.
 */
export function LabelInput({ value, style, onChange, onCommit, onCancel }: LabelInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div style={style} className="pointer-events-auto">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter')  { e.preventDefault(); onCommit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        onBlur={onCommit}
        className="w-full text-sm text-center font-bold outline-none bg-white border-2 border-violet-500 rounded-md px-2 py-1 shadow-lg"
      />
    </div>
  );
}
