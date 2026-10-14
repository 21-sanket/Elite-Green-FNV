'use client';

import { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { BigNumberInput } from '@/src/components/BigNumberInput';
import { StatusBadge } from '@/src/components/StatusBadge';
import { enqueue, newId, getDeviceId } from '@/src/lib/sync';
import type { Product, SyncStatus } from '@/src/lib/types';
import { useToday } from '@/src/lib/useToday';

interface LoadLine {
  product_id: string;
  lot_id: string;
  qty_bought: number;
  qty_sent: number;
  qty_to_send: number;
}

export default function SendLoadPage() {
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<LoadLine[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [driverName, setDriverName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [slipText, setSlipText] = useState<string | null>(null);
  const today = useToday();

  useEffect(() => {
    if (!today) return;
    async function load() {
      try {
        const [refRes, planRes] = await Promise.all([
          fetch('/api/reference?tables=products'),
          fetch(`/api/buyer/plan?date=${today}`),
        ]);
        const refData = await refRes.json();
        const planData = await planRes.json();

        setProducts(refData.products || []);

        // Build load lines from plan data (products with purchases)
        const loadLines: LoadLine[] = planData
          .filter((row: Record<string, unknown>) => Number(row.qty_bought) > 0)
          .map((row: Record<string, unknown>) => ({
            product_id: row.product_id as string,
            lot_id: '', // will be resolved by the trip_lines
            qty_bought: Number(row.qty_bought),
            qty_sent: 0, // TODO: calculate from existing trips
            qty_to_send: Number(row.qty_bought), // pre-fill with bought minus sent
          }));

        setLines(loadLines);

        // Pre-fill quantities
        const qtys: Record<string, number> = {};
        for (const l of loadLines) {
          qtys[l.product_id] = l.qty_to_send;
        }
        setQuantities(qtys);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [today]);

  const getProduct = useCallback((id: string) => products.find(p => p.id === id), [products]);

  const handleSend = useCallback(async () => {
    const linesToSend = lines.filter(l => (quantities[l.product_id] || 0) > 0);
    if (linesToSend.length === 0) return;

    setSaving(true);
    try {
      const tripId = newId();
      const deviceId = getDeviceId();
      const now = new Date().toISOString();

      // Create the trip
      await enqueue('trips', {
        id: tripId,
        leg: 'to_warehouse',
        driver_name: driverName || null,
        event_at: now,
        entered_at: now,
        biz_date: today || now.slice(0, 10),
        entered_by: 'pending',
        channel: 'form',
        device_id: deviceId,
      });

      // Create trip lines
      for (const line of linesToSend) {
        const product = getProduct(line.product_id);
        await enqueue('trip_lines', {
          id: newId(),
          trip_id: tripId,
          product_id: line.product_id,
          lot_id: line.lot_id || null,
          qty_sent: quantities[line.product_id] || 0,
          unit: product?.unit === 'pcs' ? 'pcs' : 'kg',
        });
      }

      // Generate WhatsApp slip text
      const slipLines = linesToSend.map(l => {
        const p = getProduct(l.product_id);
        const qty = quantities[l.product_id] || 0;
        return `${p?.name_en || '?'}: ${qty} ${p?.unit || 'kg'}`;
      });

      const slip = [
        `🚛 ${t.buyer.slip_title} — ${today}`,
        driverName ? `Driver: ${driverName}` : '',
        '---',
        ...slipLines,
        '---',
        `Total items: ${linesToSend.length}`,
      ].filter(Boolean).join('\n');

      setSlipText(slip);
      setSaveStatus('pending');
    } catch {
      setSaveStatus('failed');
    } finally {
      setSaving(false);
    }
  }, [lines, quantities, driverName, today, t, getProduct]);

  const handleShareSlip = useCallback(async () => {
    if (!slipText) return;
    if (navigator.share) {
      await navigator.share({ text: slipText });
    } else {
      await navigator.clipboard.writeText(slipText);
      alert('Copied to clipboard!');
    }
  }, [slipText]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-400">{t.common.loading}</div>;
  }

  if (slipText) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">{t.buyer.slip_title}</h2>
        {saveStatus && <StatusBadge status={saveStatus} />}
        <pre className="whitespace-pre-wrap rounded-xl border border-slate-700 bg-slate-800/50 p-4
                        text-sm text-slate-300 font-mono">
          {slipText}
        </pre>
        <button
          onClick={handleShareSlip}
          className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-4
                     text-lg font-semibold text-white shadow-lg"
        >
          Share via WhatsApp
        </button>
        <button
          onClick={() => setSlipText(null)}
          className="w-full rounded-xl border border-slate-600 py-3 text-sm text-slate-400"
        >
          {t.common.back}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">{t.buyer.send_load}</h2>

      {/* Driver name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Driver</label>
        <input
          type="text"
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          placeholder="Driver name"
          className="w-full rounded-xl border-2 border-slate-600 bg-slate-800/50 px-4 py-3
                     text-base text-white outline-none focus:border-emerald-500"
        />
      </div>

      {/* Product quantities */}
      {lines.map((line) => {
        const product = getProduct(line.product_id);
        if (!product) return null;

        const unitLabel = product.unit === 'pcs' ? t.common.pcs : t.common.kg;

        return (
          <div key={line.product_id} className="rounded-xl border border-slate-700/50
            bg-slate-800/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-white">{product.name_en}</span>
                {product.name_hi && (
                  <span className="text-slate-500"> / {product.name_hi}</span>
                )}
              </div>
              <div className="text-right text-xs text-slate-500">
                {t.buyer.bought}: {line.qty_bought} {unitLabel}
              </div>
            </div>

            <BigNumberInput
              value={quantities[line.product_id] || 0}
              onChange={(v) => setQuantities(prev => ({ ...prev, [line.product_id]: v }))}
              label={`${t.buyer.send_load} (${unitLabel})`}
              unit={unitLabel}
              decimal={product.unit === 'kg'}
              step={product.unit === 'kg' ? 0.5 : 1}
              max={line.qty_bought}
            />
          </div>
        );
      })}

      {lines.length === 0 && (
        <div className="text-center text-slate-500 py-8">
          No purchases to send. Buy something first.
        </div>
      )}

      {lines.length > 0 && (
        <button
          onClick={handleSend}
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-4
                     text-lg font-semibold text-white shadow-lg shadow-emerald-500/20
                     transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? t.common.loading : t.buyer.confirm_send}
        </button>
      )}
    </div>
  );
}
