'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { useToday } from '@/src/lib/useToday';

interface SettingsData {
  products: Array<{ id: string; name_en: string; name_hi: string | null; unit: 'kg' | 'pcs'; avg_weight_kg: number | null; max_fresh_days: number; extra_pct_override: number | null; active: boolean }>;
  skus: Array<{ id: string; product_id: string; label: string; base_qty_per_pack: number; active: boolean; products?: { name_en: string; name_hi: string | null; unit: string } }>;
  flipkart_rates: Array<{ id: string; sku_id: string; rate_paise: number; valid_from: string; valid_to: string | null; skus?: { label: string; products?: { name_en: string } } }>;
  mandis: Array<{ id: string; name: string }>;
  cost_types: Array<{ id: string; name: string; kind: 'fixed' | 'variable' }>;
  kg_estimates: Array<{ month: string; kg: number }>;
}

export default function OwnerSettingsPage() {
  const { formatPaise } = useI18n();
  const today = useToday();

  const [activeTab, setActiveTab] = useState<'kg' | 'rates' | 'products' | 'mandis' | 'costs'>('kg');
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Forms
  const [estMonth, setEstMonth] = useState<string>(today ? today.substring(0, 7) : '2026-10');
  const [estKg, setEstKg] = useState<number>(45000);

  const [rateSkuId, setRateSkuId] = useState<string>('');
  const [rateRupees, setRateRupees] = useState<number>(30);
  const [rateValidFrom, setRateValidFrom] = useState<string>(today || '2026-10-04');

  const [mandiName, setMandiName] = useState<string>('');
  const [costTypeName, setCostTypeName] = useState<string>('');
  const [costTypeKind, setCostTypeKind] = useState<'fixed' | 'variable'>('variable');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/settings');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      if (json.skus?.length > 0) {
        setRateSkuId((prev) => prev || json.skus[0].id);
      }
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch('/api/owner/settings')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!ignore) {
          setData(json);
          if (json.skus?.length > 0) {
            setRateSkuId((prev) => prev || json.skus[0].id);
          }
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load settings' });
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleSaveKgEstimate = async () => {
    if (!estMonth || estKg <= 0) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/owner/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_kg_estimate',
          month: `${estMonth}-01`,
          kg: estKg,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg({ type: 'success', text: 'Monthly kg estimate saved!' });
      await fetchData();
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save estimate' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddRate = async () => {
    if (!rateSkuId || rateRupees <= 0 || !rateValidFrom) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/owner/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_flipkart_rate',
          sku_id: rateSkuId,
          rate_paise: Math.round(rateRupees * 100),
          valid_from: rateValidFrom,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg({ type: 'success', text: 'Flipkart selling rate added!' });
      await fetchData();
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add rate' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddMandi = async () => {
    if (!mandiName.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/owner/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_mandi', name: mandiName.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg({ type: 'success', text: 'Mandi added!' });
      setMandiName('');
      await fetchData();
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add mandi' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddCostType = async () => {
    if (!costTypeName.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/owner/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_cost_type', name: costTypeName.trim(), kind: costTypeKind }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg({ type: 'success', text: 'Cost type added!' });
      setCostTypeName('');
      await fetchData();
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add cost type' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Settings Sub Tabs */}
      <div className="flex overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 p-1 scrollbar-none">
        <button
          onClick={() => setActiveTab('kg')}
          className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'kg' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          ⚖️ Monthly KG
        </button>
        <button
          onClick={() => setActiveTab('rates')}
          className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'rates' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          🏷️ Flipkart Rates
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'products' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          🥦 Products & SKUs
        </button>
        <button
          onClick={() => setActiveTab('mandis')}
          className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'mandis' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          🏪 Mandis
        </button>
        <button
          onClick={() => setActiveTab('costs')}
          className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'costs' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          💼 Cost Types
        </button>
      </div>

      {msg && (
        <div
          className={`rounded-xl border p-3 text-sm font-medium ${
            msg.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
              : 'border-rose-800/50 bg-rose-950/30 text-rose-300'
          }`}
        >
          {msg.type === 'success' ? '✓ ' : '✕ '} {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* TAB 1: MONTHLY KG ESTIMATE */}
          {activeTab === 'kg' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white">Monthly Expected KG Estimates</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Fixed costs (warehouse rent, monthly salaries) are allocated per kg handled. Until the month concludes,
                  the formula uses the greater of this estimate and the kg handled so far to prevent over-burdening early days.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Month (YYYY-MM)</label>
                  <input
                    type="month"
                    value={estMonth}
                    onChange={(e) => setEstMonth(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Expected Total KG</label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={estKg}
                    onChange={(e) => setEstKg(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white font-bold"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveKgEstimate}
                disabled={saving || estKg <= 0}
                className="w-full rounded-xl bg-emerald-600 py-2.5 font-semibold text-white shadow-lg active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save KG Estimate'}
              </button>

              <div className="border-t border-slate-800 pt-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Saved Estimates</h3>
                <div className="space-y-1.5">
                  {data?.kg_estimates.map((k) => (
                    <div key={k.month} className="flex justify-between items-center rounded-xl bg-slate-900/60 p-2.5 border border-slate-800 text-xs">
                      <span className="font-bold text-white">{k.month}</span>
                      <span className="font-bold text-emerald-400">{k.kg.toLocaleString()} kg</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FLIPKART RATES */}
          {activeTab === 'rates' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white">Flipkart Selling Rates</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Agreed selling rate paid by Flipkart per pack SKU. Valid from start date until superseded.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">Pack SKU</label>
                  <select
                    value={rateSkuId}
                    onChange={(e) => setRateSkuId(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  >
                    {data?.skus.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.products?.name_en} ({s.label})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">Rate per Pack (₹)</label>
                    <input
                      type="number"
                      min="1"
                      step="0.5"
                      value={rateRupees}
                      onChange={(e) => setRateRupees(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">Valid From Date</label>
                    <input
                      type="date"
                      value={rateValidFrom}
                      onChange={(e) => setRateValidFrom(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddRate}
                  disabled={saving || rateRupees <= 0}
                  className="w-full rounded-xl bg-emerald-600 py-2.5 font-semibold text-white shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Add / Update Flipkart Rate'}
                </button>
              </div>

              <div className="border-t border-slate-800 pt-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Current Rates</h3>
                <div className="space-y-1.5">
                  {data?.flipkart_rates.map((r) => (
                    <div key={r.id} className="flex justify-between items-center rounded-xl bg-slate-900/60 p-2.5 border border-slate-800 text-xs">
                      <div>
                        <div className="font-semibold text-white">
                          {r.skus?.products?.name_en} ({r.skus?.label})
                        </div>
                        <div className="text-[10px] text-slate-400">Valid from {r.valid_from}</div>
                      </div>
                      <div className="text-base font-bold text-emerald-400">
                        {formatPaise(r.rate_paise)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PRODUCTS & SKUS */}
          {activeTab === 'products' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                <h2 className="text-sm font-bold text-white">Active Products ({data?.products.length})</h2>
                <div className="space-y-2">
                  {data?.products.map((p) => (
                    <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs flex justify-between items-center">
                      <div>
                        <div className="font-bold text-white text-sm">
                          {p.name_en} {p.name_hi && <span className="text-slate-400 font-normal">({p.name_hi})</span>}
                        </div>
                        <div className="text-slate-400 mt-0.5">
                          Unit: <span className="uppercase text-slate-300 font-semibold">{p.unit}</span>
                          {p.avg_weight_kg && ` • Avg weight: ${p.avg_weight_kg} kg`}
                          {` • Fresh shelf: ${p.max_fresh_days} days`}
                        </div>
                      </div>
                      {p.extra_pct_override !== null && (
                        <div className="rounded bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 text-amber-300 font-semibold text-[11px]">
                          Override: {(p.extra_pct_override * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                <h2 className="text-sm font-bold text-white">Configured SKUs ({data?.skus.length})</h2>
                <div className="space-y-2">
                  {data?.skus.map((s) => (
                    <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs flex justify-between items-center">
                      <div>
                        <div className="font-bold text-white">{s.products?.name_en}</div>
                        <div className="text-slate-400">{s.label}</div>
                      </div>
                      <div className="font-bold text-slate-200">
                        {s.base_qty_per_pack} {s.products?.unit || 'kg'}/pack
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MANDIS */}
          {activeTab === 'mandis' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
              <h2 className="text-sm font-bold text-white">Purchase Mandis</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New Mandi Name..."
                  value={mandiName}
                  onChange={(e) => setMandiName(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleAddMandi}
                  disabled={saving || !mandiName.trim()}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Add Mandi
                </button>
              </div>

              <div className="space-y-1.5 pt-2">
                {data?.mandis.map((m) => (
                  <div key={m.id} className="rounded-xl bg-slate-900/60 p-2.5 border border-slate-800 text-xs font-bold text-white">
                    🏪 {m.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: COST TYPES */}
          {activeTab === 'costs' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
              <h2 className="text-sm font-bold text-white">Cost Types</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Cost Name (e.g. Electricity, Crates)..."
                  value={costTypeName}
                  onChange={(e) => setCostTypeName(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <select
                  value={costTypeKind}
                  onChange={(e) => setCostTypeKind(e.target.value as 'fixed' | 'variable')}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="variable">Variable</option>
                  <option value="fixed">Fixed</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddCostType}
                  disabled={saving || !costTypeName.trim()}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              <div className="space-y-1.5 pt-2">
                {data?.cost_types.map((ct) => (
                  <div key={ct.id} className="flex justify-between items-center rounded-xl bg-slate-900/60 p-2.5 border border-slate-800 text-xs">
                    <span className="font-bold text-white">{ct.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${ct.kind === 'fixed' ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'}`}>
                      {ct.kind}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
