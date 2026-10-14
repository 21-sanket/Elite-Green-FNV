'use client';

import { useState, useCallback, type ChangeEvent } from 'react';

interface BigNumberInputProps {
  value: number;
  onChange: (val: number) => void;
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Allow decimal input (for kg). Defaults to false (integer for pcs/packs) */
  decimal?: boolean;
  disabled?: boolean;
  className?: string;
}

export function BigNumberInput({
  value,
  onChange,
  label,
  unit,
  min = 0,
  max,
  step = 1,
  decimal = false,
  disabled = false,
  className = '',
}: BigNumberInputProps) {
  const [focused, setFocused] = useState(false);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') { onChange(0); return; }
    const parsed = decimal ? parseFloat(raw) : parseInt(raw, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, max !== undefined ? Math.min(parsed, max) : parsed);
      onChange(clamped);
    }
  }, [onChange, min, max, decimal]);

  const increment = useCallback(() => {
    const next = decimal ? Math.round((value + step) * 1000) / 1000 : value + step;
    if (max !== undefined && next > max) return;
    onChange(next);
  }, [value, step, max, decimal, onChange]);

  const decrement = useCallback(() => {
    const next = decimal ? Math.round((value - step) * 1000) / 1000 : value - step;
    if (next < min) return;
    onChange(next);
  }, [value, step, min, decimal, onChange]);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-sm font-medium text-slate-300">{label}</label>
      <div className={`flex items-center rounded-xl border-2 transition-colors
        ${focused ? 'border-emerald-500 bg-slate-800/80' : 'border-slate-600 bg-slate-800/50'}
        ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <button
          type="button"
          onClick={decrement}
          disabled={disabled || value <= min}
          className="flex h-14 w-14 shrink-0 items-center justify-center text-2xl font-bold
                     text-emerald-400 transition-colors hover:text-emerald-300
                     active:bg-emerald-500/20 disabled:text-slate-600 rounded-l-xl"
          aria-label="Decrease"
        >
          −
        </button>
        <div className="flex flex-1 items-baseline justify-center gap-1.5">
          <input
            type="number"
            inputMode={decimal ? 'decimal' : 'numeric'}
            value={value || ''}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={disabled}
            min={min}
            max={max}
            step={step}
            className="w-full bg-transparent text-center text-3xl font-bold text-white
                       outline-none [appearance:textfield]
                       [&::-webkit-inner-spin-button]:appearance-none
                       [&::-webkit-outer-spin-button]:appearance-none"
            placeholder="0"
          />
          {unit && (
            <span className="text-lg text-slate-400 shrink-0">{unit}</span>
          )}
        </div>
        <button
          type="button"
          onClick={increment}
          disabled={disabled || (max !== undefined && value >= max)}
          className="flex h-14 w-14 shrink-0 items-center justify-center text-2xl font-bold
                     text-emerald-400 transition-colors hover:text-emerald-300
                     active:bg-emerald-500/20 disabled:text-slate-600 rounded-r-xl"
          aria-label="Increase"
        >
          +
        </button>
      </div>
    </div>
  );
}
