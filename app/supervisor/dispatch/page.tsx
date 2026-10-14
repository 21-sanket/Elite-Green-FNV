'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { useToday } from '@/src/lib/useToday';
import { BigNumberInput } from '@/src/components/BigNumberInput';
import { StatusBadge } from '@/src/components/StatusBadge';
import { enqueue, newId, getDeviceId } from '@/src/lib/sync';
import type { SyncStatus } from '@/src/lib/types';

interface SkuItem {
  sku_id: string;
  product_id: string;
  sku_label: string;
  product?: {
    name_en: string;
    name_hi: string | null;
  };
  packs_made: number;
}

export default function DispatchPage() {
  const { t } = useI18n();
  const today = useToday();

  const [activeTab, setActiveTab] = useState<'dispatch' | 'returns'>('dispatch');
  const [skus, setSkus] = useState<SkuItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Dispatch form state
  const [driverName, setDriverName] = useState('');
  const [dispatchQtys, setDispatchQtys] = useState<Record<string, number>>({});
  const [savingDispatch, setSavingDispatch] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<SyncStatus | null>(null);
  const [dispatchSlip, setDispatchSlip] = useState<string | null>(null);

  // Returns form state
  const [returnSkuId, setReturnSkuId] = useState('');
  const [returnPacks, setReturnPacks] = useState(0);
  const [returnDriver, setReturnDriver] = useState('');
  const [savingReturn, setSavingReturn] = useState(false);
  const [returnStatus, setReturnStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    if (!today) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/supervisor/packing?date=${today}`);
        if (!res.ok) throw new Error('Failed to load packing data');
        const data = await res.json();
        if (cancelled) return;

        setSkus(data || []);

        // Pre-fill dispatch quantities with packs made
        const qtys: Record<string, number> = {};
        for (const item of data || []) {
          if (item.packs_made > 0) {
            qtys[item.sku_id] = item.packs_made;
          }
        }
        setDispatchQtys(qtys);
        if (data?.length > 0) {
          setReturnSkuId(data[0].sku_id);
        }
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

  // Handle Dispatch to Flipkart
  const handleConfirmDispatch = async () => {
    const linesToSend = skus.filter((s) => (dispatchQtys[s.sku_id] || 0) > 0);
    if (linesToSend.length === 0) return;

    setSavingDispatch(true);
    try {
      const tripId = newId();
      const deviceId = getDeviceId();
      const now = new Date().toISOString();
      const bizDate = today || now.slice(0, 10);

      // 1. Create Trip to Flipkart
      await enqueue('trips', {
        id: tripId,
        leg: 'to_flipkart',
        driver_name: driverName || null,
        event_at: now,
        entered_at: now,
        biz_date: bizDate,
        entered_by: 'pending',
        channel: 'form',
        device_id: deviceId,
      });

      // 2. Create Trip Lines for each SKU (unit = 'packs')
      const slipLines: string[] = [];
      for (const sku of linesToSend) {
        const qty = dispatchQtys[sku.sku_id] || 0;
        await enqueue('trip_lines', {
          id: newId(),
          trip_id: tripId,
          product_id: sku.product_id,
          sku_id: sku.sku_id,
          qty_sent: qty,
          unit: 'packs',
        });
        slipLines.push(`${sku.product?.name_en} (${sku.sku_label}): ${qty} packs`);
      }

      // Generate share slip
      const slip = [
        `🚛 Flipkart Dispatch — ${bizDate}`,
        driverName ? `Driver: ${driverName}` : '',
        '-------------------------',
        ...slipLines,
        '-------------------------',
        `Total SKUs: ${linesToSend.length}`,
      ].filter(Boolean).join('\n');

      setDispatchSlip(slip);
      setDispatchStatus('synced');
    } catch {
      setDispatchStatus('failed');
    } finally {
      setSavingDispatch(false);
    }
  };

  // Handle Return from Flipkart
  const handleSaveReturns = async () => {
    if (!returnSkuId || returnPacks <= 0) return;

    const sku = skus.find((s) => s.sku_id === returnSkuId);
    if (!sku) return;

    setSavingReturn(true);
    try {
      const tripId = newId();
      const lineId = newId();
      const receiptId = newId();
      const deviceId = getDeviceId();
      const now = new Date().toISOString();
      const bizDate = today || now.slice(0, 10);

      // 1. Create Return Trip (leg = 'return')
      await enqueue('trips', {
        id: tripId,
        leg: 'return',
        driver_name: returnDriver || null,
        event_at: now,
        entered_at: now,
        biz_date: bizDate,
        entered_by: 'pending',
        channel: 'form',
        device_id: deviceId,
      });

      // 2. Create Return Trip Line
      await enqueue('trip_lines', {
        id: lineId,
        trip_id: tripId,
        product_id: sku.product_id,
        sku_id: sku.sku_id,
        qty_sent: returnPacks,
        unit: 'packs',
      });

      // 3. Create Return Trip Receipt (supervisor accepts packs back into warehouse)
      await enqueue('trip_receipts', {
        id: receiptId,
        trip_id: tripId,
        event_at: now,
        entered_at: now,
        biz_date: bizDate,
        entered_by: 'pending',
        channel: 'form',
        device_id: deviceId,
      });

      // 4. Create Return Trip Receipt Line (triggers return lot creation)
      await enqueue('trip_receipt_lines', {
        id: newId(),
        receipt_id: receiptId,
        trip_line_id: lineId,
        qty_received: returnPacks,
      });

      setReturnStatus('synced');
      setReturnPacks(0);
    } catch {
      setReturnStatus('failed');
    } finally {
      setSavingReturn(false);
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
      {/* Sub-tab toggle */}
      <div className="flex rounded-xl bg-slate-900 p-1">
        <button
          onClick={() => setActiveTab('dispatch')}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all
            ${activeTab === 'dispatch' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          🚛 {t.supervisor.confirm_dispatch}
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all
            ${activeTab === 'returns' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          ↩️ {t.supervisor.return_packs}
        </button>
      </div>

      {/* DISPATCH FLOW */}
      {activeTab === 'dispatch' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <label className="block text-xs font-semibold text-slate-300">Driver / Vehicle Note</label>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="e.g. Ramesh / Tata Ace MH-12"
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Packs to load onto truck
            </h3>

            {skus.map((sku) => {
              const qty = dispatchQtys[sku.sku_id] || 0;
              return (
                <div key={sku.sku_id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-white">
                        {sku.product?.name_en} ({sku.sku_label})
                      </h4>
                      <p className="text-xs text-slate-500">Made today: {sku.packs_made} packs</p>
                    </div>
                  </div>

                  <BigNumberInput
                    value={qty}
                    onChange={(val) =>
                      setDispatchQtys((prev) => ({ ...prev, [sku.sku_id]: val }))
                    }
                    label="Packs to load"
                    unit="packs"
                    min={0}
                    step={1}
                  />
                </div>
              );
            })}
          </div>

          {dispatchSlip && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
              <h4 className="text-xs font-bold text-emerald-400">WhatsApp Slip Ready</h4>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
                {dispatchSlip}
              </pre>
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ text: dispatchSlip });
                  } else {
                    navigator.clipboard.writeText(dispatchSlip);
                    alert('Copied to clipboard!');
                  }
                }}
                className="mt-3 w-full rounded-xl bg-emerald-600/30 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-600/50"
              >
                📲 Share via WhatsApp
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleConfirmDispatch}
              disabled={savingDispatch}
              className="flex-1 rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg
                         shadow-emerald-600/30 transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
            >
              {savingDispatch ? t.common.loading : t.supervisor.confirm_dispatch}
            </button>
            {dispatchStatus && <StatusBadge status={dispatchStatus} />}
          </div>
        </div>
      )}

      {/* RETURNS FLOW */}
      {activeTab === 'returns' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
          <div>
            <h3 className="font-bold text-white">{t.supervisor.return_packs}</h3>
            <p className="text-xs text-slate-400">
              Record packs rejected at Flipkart and returned to warehouse (creates local return lot)
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300">Select Returned SKU</label>
            <select
              value={returnSkuId}
              onChange={(e) => setReturnSkuId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
            >
              {skus.map((s) => (
                <option key={s.sku_id} value={s.sku_id}>
                  {s.product?.name_en} — {s.sku_label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300">Driver bringing returns</label>
            <input
              type="text"
              value={returnDriver}
              onChange={(e) => setReturnDriver(e.target.value)}
              placeholder="Driver name"
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <BigNumberInput
            value={returnPacks}
            onChange={setReturnPacks}
            label="Packs Returned"
            unit="packs"
            min={1}
            step={1}
          />

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveReturns}
              disabled={savingReturn || returnPacks <= 0}
              className="flex-1 rounded-xl bg-amber-600 py-3.5 text-sm font-bold text-white shadow-lg
                         shadow-amber-600/30 transition-all hover:bg-amber-500 active:scale-95 disabled:opacity-50"
            >
              {savingReturn ? t.common.loading : t.supervisor.save_returns}
            </button>
            {returnStatus && <StatusBadge status={returnStatus} />}
          </div>
        </div>
      )}
    </div>
  );
}
