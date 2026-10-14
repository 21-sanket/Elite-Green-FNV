'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/src/lib/i18n';
import { BigNumberInput } from '@/src/components/BigNumberInput';
import { StatusBadge } from '@/src/components/StatusBadge';
import { enqueue, newId, getDeviceId } from '@/src/lib/sync';
import type { Product, Mandi, SyncStatus } from '@/src/lib/types';
import { useToday } from '@/src/lib/useToday';

function PurchaseContent() {
  const { t, formatPaise } = useI18n();
  const searchParams = useSearchParams();
  const preselectedProduct = searchParams.get('product');

  const [products, setProducts] = useState<Product[]>([]);
  const [mandis, setMandis] = useState<Mandi[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>(preselectedProduct || '');
  const [qty, setQty] = useState(0);
  const [ratePaise, setRatePaise] = useState(0);
  const [selectedMandi, setSelectedMandi] = useState('');
  const [todayBuys, setTodayBuys] = useState<Array<{
    id: string; qty: number; rate_paise: number; mandis?: { name: string };
  }>>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaveStatus, setLastSaveStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const today = useToday();
  const product = products.find(p => p.id === selectedProduct);

  // Load reference data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/reference?tables=products,mandis');
        const data = await res.json();
        setProducts(data.products || []);
        setMandis(data.mandis || []);

        // Pre-fill mandi from last purchase
        if (data.mandis?.length > 0) {
          setSelectedMandi(data.mandis[0].id);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load today's purchases when product changes
  useEffect(() => {
    if (!selectedProduct || !today) return;
    async function loadBuys() {
      const res = await fetch(`/api/buyer/purchases?date=${today}&product_id=${selectedProduct}`);
      const data = await res.json();
      setTodayBuys(data || []);

      // Pre-fill rate from last buy
      if (data?.length > 0) {
        setRatePaise(data[0].rate_paise);
        if (data[0].mandi_id) setSelectedMandi(data[0].mandi_id);
      }
    }
    loadBuys();
  }, [selectedProduct, today]);

  // Calculate weighted average rate
  const avgRate = todayBuys.length > 0
    ? todayBuys.reduce((sum, b) => sum + b.qty * b.rate_paise, 0) / todayBuys.reduce((sum, b) => sum + b.qty, 0)
    : null;

  const totalBought = todayBuys.reduce((sum, b) => sum + b.qty, 0);

  const handleSave = useCallback(async () => {
    if (!selectedProduct || qty <= 0 || ratePaise <= 0) return;

    setSaving(true);
    try {
      const record = {
        id: newId(),
        product_id: selectedProduct,
        mandi_id: selectedMandi || null,
        qty,
        rate_paise: ratePaise,
        biz_date: today || new Date().toISOString().slice(0, 10),
        event_at: new Date().toISOString(),
        entered_at: new Date().toISOString(),
        entered_by: 'pending', // Will be set by auth
        channel: 'form' as const,
        device_id: getDeviceId(),
      };

      const queued = await enqueue('purchases', record);
      setLastSaveStatus(queued.status);

      // Reset form
      setQty(0);

      // Reload today's buys
      const res = await fetch(`/api/buyer/purchases?date=${today}&product_id=${selectedProduct}`);
      const data = await res.json();
      setTodayBuys(data || []);
    } catch {
      setLastSaveStatus('failed');
    } finally {
      setSaving(false);
    }
  }, [selectedProduct, qty, ratePaise, selectedMandi, today]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-400">{t.common.loading}</div>;
  }

  const unitLabel = product?.unit === 'pcs' ? t.common.pcs : t.common.kg;
  const qtyLabel = product?.unit === 'pcs' ? t.buyer.qty_pcs : t.buyer.qty_kg;
  const rateLabel = product?.unit === 'pcs' ? t.buyer.rate_per_pc : t.buyer.rate_per_kg;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-white">{t.buyer.add_buy}</h2>

      {/* Product selector */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">{t.delivery.product}</label>
        <select
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
          className="w-full rounded-xl border-2 border-slate-600 bg-slate-800/50 px-4 py-3
                     text-base text-white outline-none focus:border-emerald-500"
        >
          <option value="">—</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>
              {p.name_en} {p.name_hi ? `/ ${p.name_hi}` : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedProduct && product && (
        <>
          {/* Mandi selector */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">{t.buyer.mandi}</label>
            <select
              value={selectedMandi}
              onChange={(e) => setSelectedMandi(e.target.value)}
              className="w-full rounded-xl border-2 border-slate-600 bg-slate-800/50 px-4 py-3
                         text-base text-white outline-none focus:border-emerald-500"
            >
              <option value="">—</option>
              {mandis.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <BigNumberInput
            value={qty}
            onChange={setQty}
            label={qtyLabel}
            unit={unitLabel}
            decimal={product.unit === 'kg'}
            step={product.unit === 'kg' ? 0.5 : 1}
          />

          {/* Rate */}
          <BigNumberInput
            value={ratePaise / 100}
            onChange={(v) => setRatePaise(Math.round(v * 100))}
            label={rateLabel}
            unit="₹"
            decimal
            step={0.5}
          />

          {/* Total */}
          {qty > 0 && ratePaise > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center">
              <span className="text-sm text-slate-400">Total: </span>
              <span className="text-lg font-bold text-emerald-400">
                {formatPaise(Math.round(qty * ratePaise))}
              </span>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || qty <= 0 || ratePaise <= 0}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-4
                       text-lg font-semibold text-white shadow-lg shadow-emerald-500/20
                       transition-all hover:shadow-emerald-500/30 active:scale-[0.98]
                       disabled:opacity-50 disabled:shadow-none"
          >
            {saving ? t.common.loading : t.buyer.save_buy}
          </button>

          {lastSaveStatus && (
            <div className="flex justify-center">
              <StatusBadge status={lastSaveStatus} />
            </div>
          )}

          {/* Today's purchases for this product */}
          {todayBuys.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-400">{t.buyer.today_buys}</h3>
              {todayBuys.map((buy) => (
                <div key={buy.id} className="flex items-center justify-between rounded-lg
                  border border-slate-700/50 bg-slate-800/30 px-3 py-2">
                  <div>
                    <span className="text-white">{buy.qty} {unitLabel}</span>
                    <span className="text-slate-500"> @ </span>
                    <span className="text-slate-300">{formatPaise(buy.rate_paise)}/{unitLabel}</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {buy.mandis?.name || ''}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2">
                <span className="text-sm text-emerald-400">{t.buyer.avg_rate}</span>
                <span className="font-medium text-emerald-400">
                  {avgRate ? formatPaise(avgRate) : '—'}/{unitLabel} · {totalBought} {unitLabel}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PurchasePage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-slate-400">Loading...</div>}>
      <PurchaseContent />
    </Suspense>
  );
}
