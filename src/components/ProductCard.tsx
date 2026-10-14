'use client';

import type { Product } from '@/src/lib/types';

interface ProductCardProps {
  product: Product;
  /** Primary metric (e.g., "35 kg needed") */
  metric?: string;
  /** Secondary info line */
  detail?: string;
  /** Progress 0–1 for the bar */
  progress?: number;
  /** Warning text to show below the card */
  warning?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}

export function ProductCard({
  product,
  metric,
  detail,
  progress,
  warning,
  onClick,
  children,
}: ProductCardProps) {
  const progressPct = progress !== undefined ? Math.min(Math.max(progress * 100, 0), 100) : null;
  const isComplete = progressPct !== null && progressPct >= 100;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`group w-full rounded-2xl border border-slate-700/50 bg-gradient-to-br
        from-slate-800/80 to-slate-900/80 p-4 text-left backdrop-blur-sm transition-all
        ${onClick ? 'hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5 active:scale-[0.98]' : ''}
        ${isComplete ? 'border-emerald-500/30' : ''}`}
    >
      {/* Product name: both languages */}
      <div className="mb-2">
        <h3 className="text-base font-semibold text-white">
          {product.name_en}
        </h3>
        {product.name_hi && (
          <p className="text-sm text-slate-400">{product.name_hi}</p>
        )}
      </div>

      {/* Metric */}
      {metric && (
        <p className="text-lg font-bold text-emerald-400">{metric}</p>
      )}

      {/* Detail */}
      {detail && (
        <p className="mt-0.5 text-sm text-slate-400">{detail}</p>
      )}

      {/* Progress bar */}
      {progressPct !== null && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-slate-700">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out
                ${isComplete ? 'bg-emerald-500' : progressPct > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-slate-500">
            {progressPct.toFixed(0)}%
          </p>
        </div>
      )}

      {/* Warning */}
      {warning && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
          <span>⚠</span>
          <span>{warning}</span>
        </div>
      )}

      {/* Custom children */}
      {children}
    </button>
  );
}
