'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { useToday } from '@/src/lib/useToday';
import { BigNumberInput } from '@/src/components/BigNumberInput';
import { StatusBadge } from '@/src/components/StatusBadge';
import { enqueue, newId, getDeviceId } from '@/src/lib/sync';
import type { SyncStatus } from '@/src/lib/types';

interface LotCountItem {
  product_id: string;
  lot_id: string;
  lot_date: string;
  expected_qty: number;
  default_fresh: number;
  default_local_only: number;
  product_name_en: string;
  product_name_hi: string | null;
  unit: string;
}

interface LotCountInput {
  fresh: number;
  local_only: number;
  write_off: number;
}

export default function EveningStockCountPage() {
  const { t } = useI18n();
  const today = useToday();

  const [lots, setLots] = useState<LotCountItem[]>([]);
  const [counts, setCounts] = useState<Record<string, LotCountInput>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SyncStatus | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (!today) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/supervisor/count?date=${today}`);
        if (!res.ok) throw new Error('Failed to load count defaults');
        const data = await res.json();
        if (cancelled) return;

        setLots(data || []);

        // Pre-fill inputs with default_fresh and default_local_only
        const initialCounts: Record<string, LotCountInput> = {};
        for (const lot of data || []) {
          initialCounts[lot.lot_id] = {
            fresh: lot.default_fresh,
            local_only: lot.default_local_only,
            write_off: 0,
          };
        }
        setCounts(initialCounts);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [today]);

  const handleUpdateCount = (
    lotId: string,
    field: keyof LotCountInput,
    value: number,
  ) => {
    setCounts((prev) => ({
      ...prev,
      [lotId]: {
        ...(prev[lotId] || { fresh: 0, local_only: 0, write_off: 0 }),
        [field]: value,
      },
    }));
  };

  const handleSaveCount = async () => {
    if (lots.length === 0) return;

    setSaving(true);
    try {
      const countId = newId();
      const deviceId = getDeviceId();
      const now = new Date().toISOString();
      const bizDate = today || now.slice(0, 10);

      // 1. Enqueue stock_counts header
      await enqueue('stock_counts', {
        id: countId,
        event_at: now,
        entered_at: now,
        biz_date: bizDate,
        entered_by: 'pending',
        channel: 'form',
        device_id: deviceId,
      });

      // 2. Enqueue stock_count_lines
      for (const lot of lots) {
        const c = counts[lot.lot_id] || { fresh: 0, local_only: 0, write_off: 0 };
        await enqueue('stock_count_lines', {
          id: newId(),
          count_id: countId,
          lot_id: lot.lot_id,
          fresh_qty: c.fresh,
          local_only_qty: c.local_only,
          write_off_qty: c.write_off,
        });
      }

      setSaveStatus('synced');
      setSavedSuccess(true);
    } catch {
      setSaveStatus('failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">{t.common.loading}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">{t.supervisor.count_title}</h2>
        <p className="text-xs text-slate-400">
          Pre-filled from inventory rules. Enter physical on-hand counts.
        </p>
      </div>

      {lots.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-8 text-center text-slate-500">
          <span className="text-3xl">🧺</span>
          <p className="mt-2 text-sm font-medium">No stock on hand to count</p>
          <p className="text-xs text-slate-600">All inventory has been dispatched or cleared</p>
        </div>
      ) : (
        <div className="space-y-4">
          {lots.map((lot) => {
            const input = counts[lot.lot_id] || {
              fresh: lot.default_fresh,
              local_only: lot.default_local_only,
              write_off: 0,
            };

            const countedTotal = Number(
              (input.fresh + input.local_only + input.write_off).toFixed(2),
            );
            const diff = Number((countedTotal - lot.expected_qty).toFixed(2));
            const step = lot.unit === 'pcs' ? 1 : 0.5;

            return (
              <div
                key={lot.lot_id}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm backdrop-blur-sm space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between border-b border-slate-800/60 pb-2.5">
                  <div>
                    <h3 className="font-semibold text-white leading-tight">
                      {lot.product_name_en}
                    </h3>
                    {lot.product_name_hi && (
                      <p className="text-xs text-slate-400">{lot.product_name_hi}</p>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300 font-medium">
                      Lot: {lot.lot_date}
                    </span>
                    <p className="mt-1 text-slate-400">
                      Expected: <span className="font-bold text-white">{lot.expected_qty}</span> {lot.unit}
                    </p>
                  </div>
                </div>

                {/* 3 Fields: Fresh, Local Only, Write-off */}
                <div className="space-y-3">
                  <BigNumberInput
                    value={input.fresh}
                    onChange={(val) => handleUpdateCount(lot.lot_id, 'fresh', val)}
                    label={t.supervisor.fresh}
                    unit={lot.unit}
                    min={0}
                    step={step}
                  />

                  <BigNumberInput
                    value={input.local_only}
                    onChange={(val) => handleUpdateCount(lot.lot_id, 'local_only', val)}
                    label={t.supervisor.local_only}
                    unit={lot.unit}
                    min={0}
                    step={step}
                  />

                  <BigNumberInput
                    value={input.write_off}
                    onChange={(val) => handleUpdateCount(lot.lot_id, 'write_off', val)}
                    label={t.supervisor.write_off}
                    unit={lot.unit}
                    min={0}
                    step={step}
                  />
                </div>

                {/* Difference Tally Line */}
                <div
                  className={`mt-2 rounded-xl p-2.5 text-xs font-semibold flex items-center justify-between
                    ${diff === 0
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : diff < 0
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-blue-500/10 text-blue-400'}`}
                >
                  <span>
                    Counted: {countedTotal} {lot.unit}
                  </span>
                  <span>
                    {diff === 0
                      ? '✓ Matches expected'
                      : diff < 0
                        ? `${Math.abs(diff)} ${lot.unit} ${t.supervisor.less_expected}`
                        : `+${diff} ${lot.unit} ${t.supervisor.more_expected}`}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Save Button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveCount}
              disabled={saving || savedSuccess}
              className="flex-1 rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg
                         shadow-emerald-600/30 transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
            >
              {saving ? t.common.loading : savedSuccess ? `✓ ${t.supervisor.saved}` : t.supervisor.save_count}
            </button>
            {saveStatus && <StatusBadge status={saveStatus} />}
          </div>

          {savedSuccess && (
            <div className="rounded-xl bg-emerald-500/10 p-3 text-center text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              Evening stock count saved! Write-offs, count adjustments, and fresh/local state changes have been posted to the stock engine.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
