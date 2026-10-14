'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { useToday } from '@/src/lib/useToday';
import { LanguageSwitch } from '@/src/components/LanguageSwitch';
import { SyncIndicator } from '@/src/components/StatusBadge';
import { BigNumberInput } from '@/src/components/BigNumberInput';
import Link from 'next/link';

interface ProductStock {
  id: string;
  name_en: string;
  name_hi: string | null;
  unit: 'kg' | 'pcs';
  avg_weight_kg: number | null;
  local_only_qty: number;
  fresh_qty: number;
  total_qty: number;
  last_rate_paise: number;
}

interface SaleItem {
  id: string;
  product_id: string;
  qty: number;
  rate_paise: number;
  amount_paise: number;
  pay_mode: 'cash' | 'credit';
  event_at: string;
  from_state: 'local_only' | 'fresh';
  products?: {
    name_en: string;
    name_hi: string | null;
    unit: 'kg' | 'pcs';
  };
}

interface StockResponse {
  products: ProductStock[];
  today_sales: SaleItem[];
  summary: {
    total_cash_paise: number;
    total_credit_paise: number;
    total_amount_paise: number;
    total_qty_sold: number;
    count_sales: number;
  };
}

export default function LocalSalesPage() {
  const { t, locale, formatPaise, formatQty } = useI18n();
  const today = useToday();

  const [activeTab, setActiveTab] = useState<'sell' | 'history' | 'unsold'>('sell');
  const [data, setData] = useState<StockResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [qty, setQty] = useState<number>(5);
  const [rateRupees, setRateRupees] = useState<number>(30);
  const [payMode, setPayMode] = useState<'cash' | 'credit'>('cash');
  const [note, setNote] = useState<string>('');

  const fetchStock = useCallback(async () => {
    if (!today) return;
    try {
      const res = await fetch(`/api/seller/stock?date=${today}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: StockResponse = await res.json();
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load stock data');
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    if (!today) return;
    let ignore = false;
    fetch(`/api/seller/stock?date=${today}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: StockResponse) => {
        if (!ignore) {
          setData(json);
          if (json.products.length > 0) {
            setSelectedProductId((prev) => {
              if (prev) return prev;
              const prodWithStock = json.products.find((p) => p.total_qty > 0) || json.products[0];
              if (prodWithStock.last_rate_paise > 0) {
                setRateRupees(prodWithStock.last_rate_paise / 100);
              }
              return prodWithStock.id;
            });
          }
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load stock data');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [today]);

  const selectedProduct = data?.products.find((p) => p.id === selectedProductId);

  const handleProductSelect = (p: ProductStock) => {
    setSelectedProductId(p.id);
    if (p.last_rate_paise > 0) {
      setRateRupees(p.last_rate_paise / 100);
    }
  };

  const totalAmountPaise = Math.round(qty * rateRupees * 100);

  const handleSaveSale = async () => {
    if (!selectedProductId || qty <= 0 || rateRupees < 0) return;
    setSaving(true);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/seller/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProductId,
          qty,
          rate_paise: Math.round(rateRupees * 100),
          pay_mode: payMode,
          biz_date: today,
          note: note.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      setSuccessMsg(
        locale === 'hi'
          ? `बिक्री सेव हो गई! ${formatPaise(totalAmountPaise)} (${payMode === 'cash' ? 'नक़द' : 'उधार'})`
          : `Sale saved! ${formatPaise(totalAmountPaise)} (${payMode})`,
      );
      setNote('');
      await fetchStock();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record sale');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-sm text-slate-300 hover:text-white"
            >
              ←
            </Link>
            <div>
              <h1 className="text-base font-bold text-white">{t.seller.title}</h1>
              <p className="text-xs text-slate-400">{today}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SyncIndicator />
            <LanguageSwitch />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mx-auto flex max-w-lg border-t border-slate-800/80 px-2">
          <button
            onClick={() => setActiveTab('sell')}
            className={`flex-1 border-b-2 py-2.5 text-center text-xs font-semibold transition-colors ${
              activeTab === 'sell'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            💰 {locale === 'hi' ? 'बिक्री करें' : 'Sell Produce'}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 border-b-2 py-2.5 text-center text-xs font-semibold transition-colors ${
              activeTab === 'history'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📋 {locale === 'hi' ? 'आज की बिक्री' : "Today's Sales"} ({data?.today_sales.length ?? 0})
          </button>
          <button
            onClick={() => setActiveTab('unsold')}
            className={`flex-1 border-b-2 py-2.5 text-center text-xs font-semibold transition-colors ${
              activeTab === 'unsold'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📦 {t.seller.unsold}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-800/50 bg-rose-950/30 p-4 text-center">
            <p className="text-sm text-rose-400">{error}</p>
            <button
              onClick={fetchStock}
              className="mt-3 rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-medium text-white"
            >
              {t.common.retry}
            </button>
          </div>
        ) : (
          <>
            {successMsg && (
              <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-center text-sm font-medium text-emerald-300">
                ✓ {successMsg}
              </div>
            )}

            {/* TAB 1: SELL PRODUCE */}
            {activeTab === 'sell' && (
              <div className="space-y-4">
                {/* Product horizontal scroll / selector */}
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-400">
                    {t.seller.product}
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {data?.products.map((p) => {
                      const isSelected = p.id === selectedProductId;
                      const hasStock = p.total_qty > 0;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleProductSelect(p)}
                          className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-950/30 ring-1 ring-emerald-500'
                              : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                          }`}
                        >
                          <span className="font-semibold text-slate-100 text-sm">
                            {locale === 'hi' && p.name_hi ? p.name_hi : p.name_en}
                          </span>
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                            {hasStock ? (
                              <>
                                <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-amber-300 border border-amber-800/40">
                                  {p.local_only_qty} {p.unit} local
                                </span>
                                {p.fresh_qty > 0 && (
                                  <span className="rounded bg-emerald-950/60 px-1.5 py-0.5 text-emerald-300 border border-emerald-800/40">
                                    +{p.fresh_qty} {p.unit} fresh
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-500">0 {p.unit} stock</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedProduct && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
                    {/* Stock availability callout */}
                    <div className="flex items-center justify-between rounded-xl bg-slate-800/50 p-3">
                      <div>
                        <div className="text-xs text-slate-400">
                          {locale === 'hi' ? 'उपलब्ध स्टॉक' : 'Available on Hand'}
                        </div>
                        <div className="text-sm font-semibold text-white">
                          {formatQty(selectedProduct.total_qty, selectedProduct.unit)}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <span className="text-amber-400 font-medium">
                          {selectedProduct.local_only_qty} {selectedProduct.unit} {locale === 'hi' ? 'लोकल' : 'local-only'}
                        </span>
                        {selectedProduct.fresh_qty > 0 && (
                          <div className="text-emerald-400">
                            +{selectedProduct.fresh_qty} {selectedProduct.unit} {locale === 'hi' ? 'ताज़ा' : 'fresh'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quantity input */}
                    <div>
                      <BigNumberInput
                        value={qty}
                        onChange={setQty}
                        min={0.1}
                        step={selectedProduct.unit === 'pcs' ? 1 : 0.5}
                        unit={selectedProduct.unit}
                        label={
                          locale === 'hi'
                            ? `मात्रा (${selectedProduct.unit})`
                            : `Quantity (${selectedProduct.unit})`
                        }
                      />
                    </div>

                    {/* Rate per unit input */}
                    <div>
                      <BigNumberInput
                        value={rateRupees}
                        onChange={setRateRupees}
                        min={1}
                        step={1}
                        unit="₹"
                        label={
                          locale === 'hi'
                            ? `भाव ₹ प्रति ${selectedProduct.unit}`
                            : `Rate ₹ per ${selectedProduct.unit}`
                        }
                      />
                      {selectedProduct.last_rate_paise > 0 && (
                        <div className="mt-1 text-right text-xs text-slate-400">
                          {locale === 'hi' ? 'पिछला भाव:' : 'Last rate:'}{' '}
                          <span className="text-emerald-400 font-medium">
                            ₹{(selectedProduct.last_rate_paise / 100).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Payment Mode Selector */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        {locale === 'hi' ? 'भुगतान प्रकार' : 'Payment Mode'}
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setPayMode('cash')}
                          className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-all ${
                            payMode === 'cash'
                              ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300 ring-1 ring-emerald-500'
                              : 'border-slate-800 bg-slate-900 text-slate-400'
                          }`}
                        >
                          💵 {t.seller.cash}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPayMode('credit')}
                          className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-all ${
                            payMode === 'credit'
                              ? 'border-amber-500 bg-amber-950/50 text-amber-300 ring-1 ring-amber-500'
                              : 'border-slate-800 bg-slate-900 text-slate-400'
                          }`}
                        >
                          📝 {t.seller.credit}
                        </button>
                      </div>
                    </div>

                    {/* Optional note / buyer name */}
                    <div>
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={
                          locale === 'hi'
                            ? 'ग्राहक का नाम / नोट (वैकल्पिक)'
                            : 'Buyer name / Note (optional)'
                        }
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    {/* Live total card & submit button */}
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-400">
                          {locale === 'hi' ? 'कुल राशि' : 'Total Amount'}
                        </div>
                        <div className="text-xl font-bold text-emerald-400">
                          {formatPaise(totalAmountPaise)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveSale}
                        disabled={saving || qty <= 0}
                        className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                      >
                        {saving ? t.common.loading : t.seller.save}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: TODAY'S SALES */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                    <div className="text-xs text-slate-400">
                      {locale === 'hi' ? 'कुल नक़द' : 'Total Cash'}
                    </div>
                    <div className="text-base font-bold text-emerald-400">
                      {formatPaise(data?.summary.total_cash_paise || 0)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                    <div className="text-xs text-slate-400">
                      {locale === 'hi' ? 'कुल उधार' : 'Total Credit'}
                    </div>
                    <div className="text-base font-bold text-amber-400">
                      {formatPaise(data?.summary.total_credit_paise || 0)}
                    </div>
                  </div>
                  <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3 sm:col-span-1">
                    <div className="text-xs text-slate-400">
                      {locale === 'hi' ? 'कुल माल बिका' : 'Total Sold'}
                    </div>
                    <div className="text-base font-bold text-white">
                      {(data?.summary.total_qty_sold || 0).toFixed(1)} units
                    </div>
                  </div>
                </div>

                {/* Sales list */}
                {data?.today_sales.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center text-sm text-slate-400">
                    {locale === 'hi' ? 'आज कोई लोकल बिक्री दर्ज नहीं हुई है' : 'No local sales recorded today'}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {data?.today_sales.map((sale) => {
                      const prodName =
                        locale === 'hi' && sale.products?.name_hi
                          ? sale.products.name_hi
                          : sale.products?.name_en || 'Unknown';
                      const timeStr = new Date(sale.event_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      return (
                        <div
                          key={sale.id}
                          className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-3.5"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white text-sm">{prodName}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  sale.pay_mode === 'cash'
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                                    : 'bg-amber-950/80 text-amber-400 border border-amber-800/50'
                                }`}
                              >
                                {sale.pay_mode === 'cash' ? t.seller.cash : t.seller.credit}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {sale.qty} {sale.products?.unit || 'kg'} @ ₹
                              {(sale.rate_paise / 100).toFixed(2)} • {timeStr}
                              {sale.from_state === 'fresh' && (
                                <span className="ml-1 text-[10px] text-slate-500">(fresh surplus)</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-white text-sm">
                              {formatPaise(Number(sale.amount_paise))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: UNSOLD STOCK */}
            {activeTab === 'unsold' && (
              <div className="space-y-4">
                <div className="text-xs text-slate-400">
                  {locale === 'hi'
                    ? 'वेयरहाउस में वर्तमान शेष माल (लोकल बिक्री या अगले दिन के लिए):'
                    : 'Current inventory remaining in warehouse (available for local sales or tomorrow):'}
                </div>

                <div className="space-y-2.5">
                  {data?.products.map((p) => {
                    const prodName = locale === 'hi' && p.name_hi ? p.name_hi : p.name_en;
                    const hasStock = p.total_qty > 0;
                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border p-3.5 flex items-center justify-between ${
                          hasStock
                            ? 'border-slate-800 bg-slate-900/50'
                            : 'border-slate-800/50 bg-slate-900/20 opacity-60'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-white text-sm">{prodName}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {locale === 'hi' ? 'लोकल-ओनली:' : 'Local-only:'}{' '}
                            <span className="text-amber-400 font-medium">
                              {p.local_only_qty} {p.unit}
                            </span>{' '}
                            • {locale === 'hi' ? 'ताज़ा:' : 'Fresh:'}{' '}
                            <span className="text-emerald-400 font-medium">
                              {p.fresh_qty} {p.unit}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-bold text-white">
                            {p.total_qty} {p.unit}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {locale === 'hi' ? 'कुल शेष' : 'Total on hand'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
