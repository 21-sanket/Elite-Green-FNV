'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { useToday } from '@/src/lib/useToday';

interface Sku {
  id: string;
  label: string;
  base_qty_per_pack: number;
  products: {
    id: string;
    name_en: string;
    name_hi: string | null;
    unit: 'kg' | 'pcs';
  };
}

interface OrderData {
  skus: Sku[];
  orders: Array<{
    id: string;
    delivery_date: string;
    entered_at: string;
    note: string | null;
    order_lines: Array<{ id: string; sku_id: string; packs_ordered: number }>;
  }>;
  buying_plan: {
    id: string;
    plan_date: string;
    approved_at: string | null;
    approved_by: string | null;
    plan_lines: Array<{
      id: string;
      product_id: string;
      order_qty: number;
      extra_pct: number;
      fresh_stock_qty: number;
      qty_to_buy: number;
    }>;
  } | null;
  preview_plan: Array<{
    product_id: string;
    name_en: string;
    unit: string;
    order_qty: number;
    extra_pct: number;
    learned_extra_pct: number | null;
    too_high: boolean;
    fresh_stock: number;
    qty_to_buy: number;
  }>;
}

export default function OwnerOrdersPage() {
  const { t, locale } = useI18n();
  const today = useToday();
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [data, setData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [approvingPlan, setApprovingPlan] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form inputs for SKU packs
  const [packInputs, setPackInputs] = useState<Record<string, number>>({});
  const [orderNote, setOrderNote] = useState<string>('');

  const activeDate = selectedDate || today;

  const fetchOrders = useCallback(async (d: string) => {
    if (!d) return;
    try {
      const res = await fetch(`/api/owner/orders?date=${d}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setMsg(null);
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load order data' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeDate) return;
    let ignore = false;
    fetch(`/api/owner/orders?date=${activeDate}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!ignore) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load order data' });
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [activeDate]);

  const handlePackChange = (skuId: string, val: number) => {
    setPackInputs((prev) => ({
      ...prev,
      [skuId]: Math.max(0, val),
    }));
  };

  const totalPacksEntered = Object.values(packInputs).reduce((a, b) => a + (Number(b) || 0), 0);

  const handleSaveOrder = async () => {
    if (totalPacksEntered <= 0) return;
    setSavingOrder(true);
    setMsg(null);
    try {
      const lines = Object.entries(packInputs)
        .filter(([, packs]) => packs > 0)
        .map(([sku_id, packs_ordered]) => ({ sku_id, packs_ordered }));

      const res = await fetch('/api/owner/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_order',
          delivery_date: selectedDate,
          lines,
          note: orderNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      setMsg({
        type: 'success',
        text: locale === 'hi' ? 'ऑर्डर सफलतापूर्वक दर्ज हो गया!' : 'Order saved successfully!',
      });
      setPackInputs({});
      setOrderNote('');
      await fetchOrders(selectedDate);
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save order' });
    } finally {
      setSavingOrder(false);
    }
  };

  const handleApprovePlan = async () => {
    setApprovingPlan(true);
    setMsg(null);
    try {
      const res = await fetch('/api/owner/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_plan',
          plan_date: selectedDate,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      setMsg({
        type: 'success',
        text: locale === 'hi' ? 'खरीद योजना मंज़ूर हो गई!' : 'Buying plan approved successfully!',
      });
      await fetchOrders(selectedDate);
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to approve plan' });
    } finally {
      setApprovingPlan(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Date Bar */}
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
        <span className="text-xs font-semibold text-slate-300">
          📅 {locale === 'hi' ? 'डिलीवरी तारीख़:' : 'Delivery Date:'}
        </span>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white focus:border-emerald-500 focus:outline-none"
        />
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
          {/* SECTION 1: ENTER ORDER */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white">
                  {locale === 'hi' ? 'नया Flipkart ऑर्डर दर्ज करें' : 'Enter Flipkart Order'}
                </h2>
                <p className="text-xs text-slate-400">
                  {locale === 'hi' ? 'प्रत्येक SKU के लिए ऑर्डर किए गए पैक दर्ज करें' : 'Enter packs ordered per SKU'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">{locale === 'hi' ? 'कुल पैक:' : 'Total packs:'}</span>
                <span className="ml-1 text-base font-bold text-emerald-400">{totalPacksEntered}</span>
              </div>
            </div>

            <div className="space-y-3">
              {data?.skus.map((sku) => {
                const prodName = locale === 'hi' && sku.products.name_hi ? sku.products.name_hi : sku.products.name_en;
                const curVal = packInputs[sku.id] || 0;
                return (
                  <div
                    key={sku.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/60 p-3"
                  >
                    <div>
                      <div className="font-semibold text-white text-sm">{prodName}</div>
                      <div className="text-xs text-slate-400">
                        {sku.label} ({sku.base_qty_per_pack} {sku.products.unit}/pack)
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePackChange(sku.id, Math.max(0, curVal - 10))}
                        className="h-9 w-9 rounded-lg bg-slate-800 text-slate-200 font-bold hover:bg-slate-700 active:scale-95"
                      >
                        -10
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePackChange(sku.id, Math.max(0, curVal - 1))}
                        className="h-9 w-9 rounded-lg bg-slate-800 text-slate-200 font-bold hover:bg-slate-700 active:scale-95"
                      >
                        -1
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={curVal === 0 ? '' : curVal}
                        placeholder="0"
                        onChange={(e) => handlePackChange(sku.id, parseInt(e.target.value) || 0)}
                        className="h-9 w-16 rounded-lg border border-slate-700 bg-slate-950 text-center font-bold text-white focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handlePackChange(sku.id, curVal + 1)}
                        className="h-9 w-9 rounded-lg bg-slate-800 text-slate-200 font-bold hover:bg-slate-700 active:scale-95"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePackChange(sku.id, curVal + 10)}
                        className="h-9 w-9 rounded-lg bg-slate-800 text-slate-200 font-bold hover:bg-slate-700 active:scale-95"
                      >
                        +10
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <input
                type="text"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder={locale === 'hi' ? 'ऑर्डर नोट / संदर्भ (वैकल्पिक)' : 'Order reference / PO number / note'}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveOrder}
              disabled={savingOrder || totalPacksEntered <= 0}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
            >
              {savingOrder ? t.common.loading : locale === 'hi' ? 'ऑर्डर सुरक्षित करें' : 'Save Order'}
            </button>
          </div>

          {/* SECTION 2: BUYING PLAN CALCULATION & APPROVAL */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white">
                  {locale === 'hi' ? 'खरीद योजना (buying_plan_calc)' : 'Buying Plan Calculation'}
                </h2>
                <p className="text-xs text-slate-400">
                  {locale === 'hi'
                    ? 'ऑर्डर मात्रा + सीखी हुई अतिरिक्त % - गोदाम में ताज़ा माल'
                    : 'Order qty + Learned extra % - Fresh warehouse stock'}
                </p>
              </div>

              {data?.buying_plan?.approved_at ? (
                <div className="rounded-lg bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                  ✓ {locale === 'hi' ? 'मंज़ूर' : 'Approved'}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleApprovePlan}
                  disabled={approvingPlan || !data?.preview_plan || data.preview_plan.length === 0}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
                >
                  {approvingPlan ? t.common.loading : locale === 'hi' ? 'योजना मंज़ूर करें' : 'Approve Plan'}
                </button>
              )}
            </div>

            {data?.preview_plan.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 text-center text-xs text-slate-400">
                {locale === 'hi'
                  ? 'इस तारीख़ के लिए कोई ऑर्डर नहीं है। योजना बनाने के लिए ऊपर ऑर्डर दर्ज करें।'
                  : 'No orders recorded for this date. Enter orders above to calculate buying plan.'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {data?.preview_plan.map((item) => (
                  <div
                    key={item.product_id}
                    className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">{item.name_en}</span>
                        {item.too_high && (
                          <span className="rounded bg-rose-950/80 border border-rose-800/60 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                            Extra % Capped
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Order: {item.order_qty} {item.unit} • Extra: {(item.extra_pct * 100).toFixed(0)}% • Fresh stock: {item.fresh_stock} {item.unit}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-bold text-emerald-400">
                        {item.qty_to_buy} {item.unit}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                        {locale === 'hi' ? 'खरीदना है' : 'To Buy'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
