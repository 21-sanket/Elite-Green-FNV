'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { useToday } from '@/src/lib/useToday';
import Link from 'next/link';

interface DashboardData {
  date: string;
  missing_kg_estimate: boolean;
  month_estimate_kg: number | null;
  fill_rate: {
    today: {
      ordered_packs: number;
      accepted_packs: number;
      rate: number;
    } | null;
    avg_7_day: number | null;
  };
  profit: {
    revenue_flipkart_paise: number;
    revenue_local_paise: number;
    cogs_flipkart_paise: number;
    cogs_local_paise: number;
    losses_paise: number;
    giveaway_paise: number;
    variable_costs_paise: number;
    fixed_costs_paise: number;
    flipkart_deductions_paise: number;
    net_profit_paise: number;
  } | null;
  cash: {
    cash_in_paise: number;
    cash_out_paise: number;
    net_cash_paise: number;
  } | null;
  operations: {
    ordered_kg: number;
    ordered_packs: number;
    bought_kg: number;
    packed_kg: number;
    packed_packs: number;
    accepted_kg: number;
    accepted_packs: number;
  };
  review_count: number;
  inbox_items: Array<{ id: string; channel: string; raw_text: string; created_at: string }>;
  negative_stock_alerts: Array<{
    product_id: string;
    lot_id: string;
    qty: number;
    products?: { name_en: string; name_hi: string | null; unit: string };
  }>;
  buying_plan_approved: boolean;
}

export default function OwnerDashboardPage() {
  const { t, locale, formatPaise } = useI18n();
  const today = useToday();
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeDate = selectedDate || today;

  const fetchDashboard = useCallback(async (d: string) => {
    if (!d) return;
    try {
      const res = await fetch(`/api/owner/dashboard?date=${d}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeDate) return;
    let ignore = false;
    fetch(`/api/owner/dashboard?date=${activeDate}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!ignore) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [activeDate]);

  const fillPctToday =
    data?.fill_rate.today?.rate !== undefined && data?.fill_rate.today?.rate !== null
      ? (data.fill_rate.today.rate * 100).toFixed(1)
      : null;

  const fillPct7Day =
    data?.fill_rate.avg_7_day !== undefined && data?.fill_rate.avg_7_day !== null
      ? (data.fill_rate.avg_7_day * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-4">
      {/* Date selector toolbar */}
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
        <span className="text-xs font-semibold text-slate-300">
          📅 {locale === 'hi' ? 'तारीख़ चुनें:' : 'Select Date:'}
        </span>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white focus:border-emerald-500 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-800/50 bg-rose-950/30 p-4 text-center">
          <p className="text-sm text-rose-400">{error}</p>
          <button
            onClick={() => fetchDashboard(selectedDate)}
            className="mt-3 rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-medium text-white"
          >
            {t.common.retry}
          </button>
        </div>
      ) : (
        <>
          {/* Missing KG Estimate Warning */}
          {data?.missing_kg_estimate && (
            <Link
              href="/owner/settings"
              className="flex items-center justify-between rounded-xl border border-amber-600/50 bg-amber-950/40 p-3.5 transition-all hover:border-amber-500"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">⚠️</span>
                <div>
                  <div className="text-sm font-bold text-amber-300">
                    {t.owner.no_kg_estimate}
                  </div>
                  <div className="text-xs text-amber-400/80">
                    {locale === 'hi'
                      ? 'फिक्स्ड लागत बाँटने के लिए मासिक किलो अनुमान दर्ज करें'
                      : 'Set monthly expected kg to accurately allocate fixed costs.'}
                  </div>
                </div>
              </div>
              <span className="text-xs font-semibold text-amber-300 underline">
                {locale === 'hi' ? 'सेट करें →' : 'Set now →'}
              </span>
            </Link>
          )}

          {/* Negative Stock Alerts */}
          {data && data.negative_stock_alerts.length > 0 && (
            <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-3.5 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-400">
                <span>🚨</span> {locale === 'hi' ? 'नेगेटिव स्टॉक चेतावनी' : 'Negative Stock Alert'}
              </div>
              {data.negative_stock_alerts.map((alert, idx) => (
                <div key={idx} className="text-xs text-rose-200">
                  • {alert.products?.name_en || 'Product'}: {alert.qty} {alert.products?.unit || 'kg'} in lot {alert.lot_id.substring(0, 8)}...
                </div>
              ))}
            </div>
          )}

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Fill Rate */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
              <div className="text-xs text-slate-400">{t.owner.fill_rate}</div>
              <div className="mt-1 text-2xl font-black text-emerald-400">
                {fillPctToday !== null ? `${fillPctToday}%` : '—'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {fillPct7Day !== null ? `7d avg: ${fillPct7Day}%` : 'No history'}
              </div>
            </div>

            {/* Net Profit */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
              <div className="text-xs text-slate-400">
                {locale === 'hi' ? 'शुद्ध मुनाफ़ा' : 'Net Profit'}
              </div>
              <div
                className={`mt-1 text-2xl font-black ${
                  (data?.profit?.net_profit_paise || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {data?.profit ? formatPaise(data.profit.net_profit_paise) : '—'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {locale === 'hi' ? 'आज का परिणाम' : "Today's bottomline"}
              </div>
            </div>

            {/* Cash in / out */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
              <div className="text-xs text-slate-400">
                {locale === 'hi' ? 'नक़दी आवाजाही' : 'Net Cash'}
              </div>
              <div
                className={`mt-1 text-xl font-black ${
                  (data?.cash?.net_cash_paise || 0) >= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {data?.cash ? formatPaise(data.cash.net_cash_paise) : '—'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                In: {formatPaise(data?.cash?.cash_in_paise || 0)}
              </div>
            </div>

            {/* Buying plan status */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
              <div className="text-xs text-slate-400">
                {locale === 'hi' ? 'खरीद योजना' : 'Buying Plan'}
              </div>
              <div className="mt-1 text-base font-bold">
                {data?.buying_plan_approved ? (
                  <span className="text-emerald-400">✓ Approved</span>
                ) : (
                  <span className="text-amber-400">⏳ Pending</span>
                )}
              </div>
              <Link href="/owner/orders" className="mt-1 block text-[11px] text-emerald-400 underline">
                {locale === 'hi' ? 'योजना देखें →' : 'Review Plan →'}
              </Link>
            </div>
          </div>

          {/* Operations Progress Pipeline */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t.owner.today_progress} (kg)
              </h2>
              <span className="text-xs text-slate-500">{selectedDate}</span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-slate-800/40 p-2.5">
                <div className="text-[11px] text-slate-400">{locale === 'hi' ? 'ऑर्डर' : 'Ordered'}</div>
                <div className="text-base font-bold text-white mt-0.5">
                  {data?.operations.ordered_kg} kg
                </div>
                <div className="text-[10px] text-slate-500">
                  {data?.operations.ordered_packs} packs
                </div>
              </div>

              <div className="rounded-xl bg-slate-800/40 p-2.5">
                <div className="text-[11px] text-slate-400">{locale === 'hi' ? 'खरीदा' : 'Bought'}</div>
                <div className="text-base font-bold text-blue-400 mt-0.5">
                  {data?.operations.bought_kg} kg
                </div>
                <div className="text-[10px] text-slate-500">Mandi intake</div>
              </div>

              <div className="rounded-xl bg-slate-800/40 p-2.5">
                <div className="text-[11px] text-slate-400">{locale === 'hi' ? 'पैक हुआ' : 'Packed'}</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">
                  {data?.operations.packed_kg} kg
                </div>
                <div className="text-[10px] text-slate-500">
                  {data?.operations.packed_packs} packs
                </div>
              </div>

              <div className="rounded-xl bg-slate-800/40 p-2.5">
                <div className="text-[11px] text-slate-400">{locale === 'hi' ? 'स्वीकार' : 'Accepted'}</div>
                <div className="text-base font-bold text-emerald-400 mt-0.5">
                  {data?.operations.accepted_kg} kg
                </div>
                <div className="text-[10px] text-slate-500">
                  {data?.operations.accepted_packs} packs
                </div>
              </div>
            </div>
          </div>

          {/* Daily Profit Breakdown (from SQL view profit_daily) */}
          {data?.profit && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {locale === 'hi' ? 'आज का वित्तीय विवरण (SQL व्यू से)' : 'Financial Summary (from SQL view)'}
                </h2>
                <Link href="/owner/reports?report=profit_daily" className="text-xs text-emerald-400 hover:underline">
                  {locale === 'hi' ? 'विस्तार देखें →' : 'Full view →'}
                </Link>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Flipkart Revenue</span>
                  <span className="font-semibold text-emerald-400">
                    +{formatPaise(data.profit.revenue_flipkart_paise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Local Sales Revenue</span>
                  <span className="font-semibold text-emerald-400">
                    +{formatPaise(data.profit.revenue_local_paise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Flipkart COGS</span>
                  <span className="font-semibold text-slate-300">
                    -{formatPaise(data.profit.cogs_flipkart_paise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Local COGS</span>
                  <span className="font-semibold text-slate-300">
                    -{formatPaise(data.profit.cogs_local_paise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Losses (Transit + Graded + Scrap)</span>
                  <span className="font-semibold text-rose-400">
                    -{formatPaise(data.profit.losses_paise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Giveaway (Overpacking)</span>
                  <span className="font-semibold text-amber-400">
                    -{formatPaise(data.profit.giveaway_paise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Variable Costs (Transport/Fuel)</span>
                  <span className="font-semibold text-slate-300">
                    -{formatPaise(data.profit.variable_costs_paise)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Fixed Costs (Allocated by kg)</span>
                  <span className="font-semibold text-slate-300">
                    -{formatPaise(data.profit.fixed_costs_paise)}
                  </span>
                </div>
                {data.profit.flipkart_deductions_paise > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Flipkart Deductions</span>
                    <span className="font-semibold text-rose-400">
                      -{formatPaise(data.profit.flipkart_deductions_paise)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-2 text-sm font-bold">
                  <span className="text-white">Net Daily Profit</span>
                  <span
                    className={data.profit.net_profit_paise >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                  >
                    {formatPaise(data.profit.net_profit_paise)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions Shortcuts */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Link
              href="/owner/orders"
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center transition-all hover:border-emerald-500/50"
            >
              <div className="text-lg">📝</div>
              <div className="text-xs font-semibold text-white mt-1">Orders & Plan</div>
            </Link>
            <Link
              href="/owner/costs"
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center transition-all hover:border-emerald-500/50"
            >
              <div className="text-lg">💸</div>
              <div className="text-xs font-semibold text-white mt-1">Costs & Pay</div>
            </Link>
            <Link
              href="/owner/reports"
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center transition-all hover:border-emerald-500/50"
            >
              <div className="text-lg">📊</div>
              <div className="text-xs font-semibold text-white mt-1">Reports View</div>
            </Link>
            <Link
              href="/owner/void"
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center transition-all hover:border-emerald-500/50"
            >
              <div className="text-lg">🗑️</div>
              <div className="text-xs font-semibold text-white mt-1">Void Record</div>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
