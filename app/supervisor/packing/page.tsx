'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { useToday } from '@/src/lib/useToday';
import { BigNumberInput } from '@/src/components/BigNumberInput';
import { StatusBadge } from '@/src/components/StatusBadge';
import { enqueue, newId, getDeviceId } from '@/src/lib/sync';
import type { SyncStatus } from '@/src/lib/types';

interface SkuPackingItem {
  sku_id: string;
  product_id: string;
  sku_label: string;
  base_qty_per_pack: number;
  product?: {
    id: string;
    name_en: string;
    name_hi: string | null;
    unit: string;
  };
  lot_id: string | null;
  packs_ordered: number;
  packs_made: number;
  packs_remaining: number;
  total_packed_kg: number;
  total_graded_kg: number;
  giveaway_kg: number;
  fill_rate_pct: number;
}

export default function PackingPage() {
  const { t } = useI18n();
  const today = useToday();

  const [items, setItems] = useState<SkuPackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSku, setSelectedSku] = useState<SkuPackingItem | null>(null);

  // Form state
  const [packsMade, setPacksMade] = useState(0);
  const [qtyPacked, setQtyPacked] = useState(0);
  const [qtyGraded, setQtyGraded] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    if (!today) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/supervisor/packing?date=${today}`);
        if (!res.ok) throw new Error('Failed to load packing data');
        const data = await res.json();
        if (!cancelled) setItems(data || []);
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

  const handleSelectSku = (sku: SkuPackingItem) => {
    setSelectedSku(sku);
    setSaveStatus(null);
    // Pre-fill default packs made with remaining needed
    const defaultPacks = sku.packs_remaining > 0 ? sku.packs_remaining : 10;
    setPacksMade(defaultPacks);
    setQtyPacked(Number((defaultPacks * sku.base_qty_per_pack).toFixed(1)));
    setQtyGraded(0);
  };

  // Auto-sync expected kg packed when packs made changes
  const handlePacksMadeChange = (packs: number) => {
    setPacksMade(packs);
    if (selectedSku) {
      setQtyPacked(Number((packs * selectedSku.base_qty_per_pack).toFixed(1)));
    }
  };

  // Live giveaway calculation
  const expectedWeight = selectedSku ? packsMade * selectedSku.base_qty_per_pack : 0;
  const giveaway = qtyPacked > expectedWeight ? Number((qtyPacked - expectedWeight).toFixed(2)) : 0;

  const handleSavePackRun = async () => {
    if (!selectedSku || packsMade <= 0 || qtyPacked <= 0) return;

    setSaving(true);
    try {
      const runId = newId();
      const deviceId = getDeviceId();
      const now = new Date().toISOString();
      const bizDate = today || now.slice(0, 10);

      // 1. Enqueue pack_runs
      await enqueue('pack_runs', {
        id: runId,
        sku_id: selectedSku.sku_id,
        packs_made: Math.round(packsMade),
        event_at: now,
        entered_at: now,
        biz_date: bizDate,
        entered_by: 'pending',
        channel: 'form',
        device_id: deviceId,
      });

      // 2. Enqueue pack_run_lots (links to lot)
      if (selectedSku.lot_id) {
        await enqueue('pack_run_lots', {
          id: newId(),
          pack_run_id: runId,
          lot_id: selectedSku.lot_id,
          qty_packed: qtyPacked,
          qty_graded_out: qtyGraded,
        });
      }

      setSaveStatus('synced');
      // Update local state tally
      setItems((prev) =>
        prev.map((item) =>
          item.sku_id === selectedSku.sku_id
            ? {
                ...item,
                packs_made: item.packs_made + packsMade,
                packs_remaining: Math.max(0, item.packs_remaining - packsMade),
                total_packed_kg: item.total_packed_kg + qtyPacked,
                total_graded_kg: item.total_graded_kg + qtyGraded,
              }
            : item,
        ),
      );

      setTimeout(() => setSelectedSku(null), 1200);
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
        <h2 className="text-lg font-bold text-white">{t.supervisor.packing_title}</h2>
        <p className="text-xs text-slate-400">{today || 'Today'}: Log SKU packing runs and grade-outs</p>
      </div>

      {/* Pack Run Form Modal/Card */}
      {selectedSku && (
        <div className="rounded-2xl border border-emerald-500/40 bg-slate-900/95 p-4 shadow-xl backdrop-blur-md">
          <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-semibold text-white">
                {selectedSku.product?.name_en} ({selectedSku.sku_label})
              </h3>
              {selectedSku.product?.name_hi && (
                <p className="text-xs text-slate-400">{selectedSku.product.name_hi}</p>
              )}
            </div>
            <button
              onClick={() => setSelectedSku(null)}
              className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* Packs Made */}
            <BigNumberInput
              value={packsMade}
              onChange={handlePacksMadeChange}
              label={t.supervisor.packs_made}
              unit="packs"
              min={1}
              step={1}
            />

            {/* Total kg/pcs packed */}
            <BigNumberInput
              value={qtyPacked}
              onChange={setQtyPacked}
              label={`${selectedSku.product?.unit === 'pcs' ? 'Pieces' : 'kg'} packed`}
              unit={selectedSku.product?.unit || 'kg'}
              min={0.1}
              step={0.1}
            />

            {/* Grade out / wastage */}
            <BigNumberInput
              value={qtyGraded}
              onChange={setQtyGraded}
              label={`${selectedSku.product?.unit === 'pcs' ? 'Pieces' : 'kg'} graded out`}
              unit={selectedSku.product?.unit || 'kg'}
              min={0}
              step={0.1}
            />

            {/* Giveaway alert */}
            {giveaway > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <span>⚠️ Pack overweight (Giveaway):</span>
                <span className="font-bold">+{giveaway} {selectedSku.product?.unit || 'kg'}</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSavePackRun}
              disabled={saving || packsMade <= 0 || qtyPacked <= 0}
              className="flex-1 rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg
                         shadow-emerald-600/30 transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
            >
              {saving ? t.common.loading : t.supervisor.save_run}
            </button>
            {saveStatus && <StatusBadge status={saveStatus} />}
          </div>
        </div>
      )}

      {/* SKUs List */}
      <div className="space-y-3">
        {items.map((sku) => {
          const isSelected = selectedSku?.sku_id === sku.sku_id;
          const isComplete = sku.packs_ordered > 0 && sku.packs_made >= sku.packs_ordered;
          const progressPct =
            sku.packs_ordered > 0
              ? Math.min(100, Math.round((sku.packs_made / sku.packs_ordered) * 100))
              : 100;

          return (
            <button
              key={sku.sku_id}
              onClick={() => handleSelectSku(sku)}
              className={`w-full rounded-2xl border p-4 text-left transition-all backdrop-blur-sm
                ${isSelected
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 active:scale-[0.98]'}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-white">
                    {sku.product?.name_en} <span className="text-emerald-400">({sku.sku_label})</span>
                  </h4>
                  {sku.product?.name_hi && (
                    <p className="text-xs text-slate-400">{sku.product.name_hi}</p>
                  )}
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold
                    ${isComplete
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-slate-800 text-slate-300'}`}
                >
                  {sku.packs_made} / {sku.packs_ordered} packs
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-emerald-500' : 'bg-emerald-500/70'}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <span>{t.supervisor.fill_pct}: {progressPct}%</span>
                  <span>Needed: {sku.packs_remaining}</span>
                </div>
              </div>

              {/* Metrics row */}
              <div className="mt-3 flex items-center justify-between border-t border-slate-800/60 pt-2 text-xs text-slate-400">
                <span>Total: {sku.total_packed_kg} kg</span>
                {sku.giveaway_kg > 0 ? (
                  <span className="text-amber-400 font-medium">Giveaway: +{sku.giveaway_kg} kg</span>
                ) : (
                  <span className="text-slate-500">Graded: {sku.total_graded_kg} kg</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
