'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/src/lib/i18n';

const reportOptions = [
  { id: 'fill_rate', labelEn: 'Fill Rate by Day', labelHi: 'फ़िल रेट — दिन अनुसार' },
  { id: 'shortfall', labelEn: 'Shortfall by Reason', labelHi: 'कमी — कारण अनुसार' },
  { id: 'profit_daily', labelEn: 'Profit by Day', labelHi: 'मुनाफ़ा — दिन अनुसार' },
  { id: 'profit_product', labelEn: 'Profit by Product', labelHi: 'मुनाफ़ा — उत्पाद अनुसार' },
  { id: 'profit_monthly', labelEn: 'Monthly Profit', labelHi: 'मासिक शुद्ध मुनाफ़ा' },
  { id: 'losses', labelEn: 'Losses Valued (Wastage)', labelHi: 'बर्बादी विवरण' },
  { id: 'giveaway', labelEn: 'Overpacking Giveaway', labelHi: 'अतिरिक्त वजन नुकसान' },
  { id: 'stock_book', labelEn: 'Stock Book Daily', labelHi: 'दैनिक स्टॉक बुक' },
  { id: 'cash', labelEn: 'Cash Flow by Day', labelHi: 'दैनिक नक़दी आवाजाही' },
  { id: 'flipkart_receivable', labelEn: 'Flipkart Receivable', labelHi: 'Flipkart कुल बकाया' },
  { id: 'packs_outstanding', labelEn: 'Packs Outstanding', labelHi: 'बाकी पैक विवरण' },
  { id: 'mandi_comparison', labelEn: 'Mandi Rate Comparison', labelHi: 'मंडी भाव तुलना' },
  { id: 'negative_stock', labelEn: 'Negative Stock Alerts', labelHi: 'नेगेटिव स्टॉक अलर्ट' },
];

export default function OwnerReportsPage() {
  const { locale, formatPaise } = useI18n();
  const [selectedReport, setSelectedReport] = useState<string>('fill_rate');
  const [filterDate, setFilterDate] = useState<string>('');
  const [data, setData] = useState<Record<string, unknown> | Array<Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    let url = `/api/owner/reports?report=${selectedReport}`;
    if (filterDate && selectedReport !== 'profit_monthly' && selectedReport !== 'flipkart_receivable') {
      url += `&date=${filterDate}`;
    }

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!ignore) {
          setData(json.data);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to fetch report');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedReport, filterDate]);

  return (
    <div className="space-y-4">
      {/* Report selector & date toolbar */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {locale === 'hi' ? 'रिपोर्ट चुनें (SQL व्यू से):' : 'Select SQL View Report:'}
          </label>
          <select
            value={selectedReport}
            onChange={(e) => setSelectedReport(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-white focus:border-emerald-500 focus:outline-none"
          >
            {reportOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {locale === 'hi' ? opt.labelHi : opt.labelEn}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {locale === 'hi' ? 'तारीख़ फ़िल्टर:' : 'Date Filter:'}
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
            {filterDate && (
              <button
                type="button"
                onClick={() => setFilterDate('')}
                className="rounded-lg bg-slate-800 px-2 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main View Display */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-800/50 bg-rose-950/30 p-4 text-center">
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 overflow-x-auto">
          {/* 1. FILL RATE */}
          {selectedReport === 'fill_rate' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                fill_rate_daily (Ordered vs Accepted)
              </div>
              <div className="space-y-2">
                {Array.isArray(data) && data.map((item, i) => {
                  const row = item as { biz_date: string; ordered_packs: number; accepted_packs: number; fill_rate: number };
                  const ratePct = (Number(row.fill_rate) * 100).toFixed(1);
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <div>
                        <div className="font-semibold text-white text-sm">{row.biz_date}</div>
                        <div className="text-xs text-slate-400">
                          Ordered: {row.ordered_packs} packs • Accepted: {row.accepted_packs} packs
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-black ${Number(ratePct) >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {ratePct}%
                        </div>
                        <div className="text-[10px] text-slate-500">Fill Rate</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. SHORTFALL BY REASON */}
          {selectedReport === 'shortfall' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                shortfall_by_reason (Quality & Rejections)
              </div>
              <div className="space-y-2">
                {Array.isArray(data) && data.map((item, i) => {
                  const row = item as { biz_date: string; reason: string; short_packs: number; skus?: { label: string; products?: { name_en: string } } };
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <div>
                        <div className="font-semibold text-white text-sm">
                          {row.skus?.products?.name_en || 'SKU'} ({row.skus?.label})
                        </div>
                        <div className="text-xs text-slate-400">
                          {row.biz_date} • Reason: <span className="text-amber-400 font-semibold">{row.reason}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-rose-400">
                          -{row.short_packs} packs
                        </div>
                        <div className="text-[10px] text-slate-500">Shortfall</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. DAILY PROFIT */}
          {selectedReport === 'profit_daily' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                profit_daily (Revenue - COGS - Losses - Costs)
              </div>
              <div className="space-y-2">
                {Array.isArray(data) && data.map((item, i) => {
                  const row = item as {
                    biz_date: string;
                    revenue_flipkart_paise: number;
                    revenue_local_paise: number;
                    cogs_flipkart_paise: number;
                    cogs_local_paise: number;
                    losses_paise: number;
                    giveaway_paise: number;
                    variable_costs_allocated_paise: number;
                    fixed_costs_paise: number;
                    profit_paise: number;
                  };
                  return (
                    <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="font-bold text-white text-sm">{row.biz_date}</span>
                        <span className={`text-base font-black ${row.profit_paise >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatPaise(row.profit_paise)} Net
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-4">
                        <div>Rev FK: <span className="text-emerald-400 font-medium">{formatPaise(row.revenue_flipkart_paise)}</span></div>
                        <div>Rev Local: <span className="text-emerald-400 font-medium">{formatPaise(row.revenue_local_paise)}</span></div>
                        <div>COGS FK: <span className="text-slate-300 font-medium">{formatPaise(row.cogs_flipkart_paise)}</span></div>
                        <div>Losses: <span className="text-rose-400 font-medium">{formatPaise(row.losses_paise)}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. PROFIT BY PRODUCT */}
          {selectedReport === 'profit_product' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                profit_daily_product (Product Level Margin)
              </div>
              <div className="space-y-2">
                {Array.isArray(data) && data.map((item, i) => {
                  const row = item as {
                    biz_date: string;
                    product_id: string;
                    revenue_flipkart_paise: number;
                    revenue_local_paise: number;
                    losses_paise: number;
                    profit_paise: number;
                    products?: { name_en: string; unit: string };
                  };
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <div>
                        <div className="font-semibold text-white text-sm">{row.products?.name_en || 'Product'}</div>
                        <div className="text-xs text-slate-400">
                          {row.biz_date} • Rev: {formatPaise(row.revenue_flipkart_paise + row.revenue_local_paise)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-base font-bold ${row.profit_paise >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatPaise(row.profit_paise)}
                        </div>
                        <div className="text-[10px] text-slate-500">Margin</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. MONTHLY PROFIT */}
          {selectedReport === 'profit_monthly' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                profit_monthly (Net after unallocated fixed costs)
              </div>
              <div className="space-y-2">
                {Array.isArray(data) && data.map((item, i) => {
                  const row = item as { month: string; profit_daily_total_paise: number; fixed_unallocated_paise: number; net_profit_paise: number };
                  return (
                    <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white text-base">{row.month}</div>
                        <div className="text-xs text-slate-400">
                          Daily Totals: {formatPaise(row.profit_daily_total_paise)} • Unallocated Fixed: {formatPaise(row.fixed_unallocated_paise)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-black ${row.net_profit_paise >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatPaise(row.net_profit_paise)}
                        </div>
                        <div className="text-[10px] text-slate-500">Monthly Net</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. LOSSES VALUED */}
          {selectedReport === 'losses' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                losses_valued (Transit Loss, Graded Out, Written Off)
              </div>
              <div className="space-y-2">
                {Array.isArray(data) && data.map((item, i) => {
                  const row = item as { biz_date: string; reason: string; qty_lost: number; value_paise: number; products?: { name_en: string; unit: string } };
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <div>
                        <div className="font-semibold text-white text-sm">{row.products?.name_en || 'Product'}</div>
                        <div className="text-xs text-slate-400">
                          {row.biz_date} • <span className="text-amber-400 uppercase">{row.reason}</span> • Lost: {row.qty_lost} {row.products?.unit || 'kg'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-rose-400">
                          -{formatPaise(row.value_paise)}
                        </div>
                        <div className="text-[10px] text-slate-500">Loss Value</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 7. GIVEAWAY */}
          {selectedReport === 'giveaway' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                giveaway_daily (Overpacking beyond nominal SKU weight)
              </div>
              <div className="space-y-2">
                {Array.isArray(data) && data.map((item, i) => {
                  const row = item as { biz_date: string; qty: number; value_paise: number; products?: { name_en: string; unit: string } };
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <div>
                        <div className="font-semibold text-white text-sm">{row.products?.name_en || 'Product'}</div>
                        <div className="text-xs text-slate-400">
                          {row.biz_date} • Overpacked: {row.qty} {row.products?.unit || 'kg'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-amber-400">
                          -{formatPaise(row.value_paise)}
                        </div>
                        <div className="text-[10px] text-slate-500">Giveaway Value</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 8. STOCK BOOK */}
          {selectedReport === 'stock_book' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                stock_book_daily (Opening + In - Out = Closing)
              </div>
              <div className="space-y-2">
                {Array.isArray(data) && data.map((item, i) => {
                  const row = item as {
                    biz_date: string;
                    opening: number;
                    purchase_in: number;
                    packed: number;
                    graded_out: number;
                    sold_local: number;
                    closing: number;
                    products?: { name_en: string; unit: string };
                  };
                  return (
                    <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1 text-xs">
                      <div className="flex justify-between font-bold text-white text-sm border-b border-slate-800 pb-1">
                        <span>{row.products?.name_en || 'Product'} ({row.biz_date})</span>
                        <span>Closing: {row.closing} {row.products?.unit || 'kg'}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-slate-400 pt-1">
                        <div>Open: {row.opening}</div>
                        <div>In: +{row.purchase_in || 0}</div>
                        <div>Packed: {row.packed || 0}</div>
                        <div>Graded: {row.graded_out || 0}</div>
                        <div>Local Sold: {row.sold_local || 0}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 9. CASH FLOW */}
          {selectedReport === 'cash' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                cash_daily (Cash in vs Cash out)
              </div>
              <div className="space-y-2">
                {Array.isArray(data) && data.map((item, i) => {
                  const row = item as { biz_date: string; cash_in_paise: number; cash_out_paise: number };
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <div>
                        <div className="font-semibold text-white text-sm">{row.biz_date}</div>
                        <div className="text-xs text-slate-400">
                          In: {formatPaise(row.cash_in_paise)} • Out: {formatPaise(row.cash_out_paise)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-base font-bold ${row.cash_in_paise >= row.cash_out_paise ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {formatPaise(row.cash_in_paise - row.cash_out_paise)}
                        </div>
                        <div className="text-[10px] text-slate-500">Net Flow</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 10. FLIPKART RECEIVABLE */}
          {selectedReport === 'flipkart_receivable' && data && (
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                flipkart_receivable (Outstanding Balance)
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2.5">
                {(() => {
                  const r = data as { billed_paise: number; received_paise: number; deducted_paise: number; owed_paise: number };
                  return (
                    <>
                      <div className="flex justify-between text-sm py-1 border-b border-slate-800">
                        <span className="text-slate-400">Total Billed:</span>
                        <span className="font-semibold text-white">{formatPaise(r.billed_paise)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1 border-b border-slate-800">
                        <span className="text-slate-400">Total Received:</span>
                        <span className="font-semibold text-emerald-400">-{formatPaise(r.received_paise)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1 border-b border-slate-800">
                        <span className="text-slate-400">Total Deductions:</span>
                        <span className="font-semibold text-rose-400">-{formatPaise(r.deducted_paise)}</span>
                      </div>
                      <div className="flex justify-between text-lg font-black pt-2 text-emerald-400">
                        <span>Current Owed / Outstanding:</span>
                        <span>{formatPaise(r.owed_paise)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 11. PACKS OUTSTANDING */}
          {selectedReport === 'packs_outstanding' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                packs_outstanding_daily (Made - Accepted - Returned)
              </div>
              <div className="space-y-2">
                {Array.isArray(data) && data.map((item, i) => {
                  const row = item as {
                    biz_date: string;
                    packs_made: number;
                    packs_accepted: number;
                    packs_returned: number;
                    packs_outstanding: number;
                    skus?: { label: string; products?: { name_en: string } };
                  };
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <div>
                        <div className="font-semibold text-white text-sm">
                          {row.skus?.products?.name_en || 'SKU'} ({row.skus?.label})
                        </div>
                        <div className="text-xs text-slate-400">
                          {row.biz_date} • Made: {row.packs_made} • Accepted: {row.packs_accepted} • Ret: {row.packs_returned}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-base font-bold ${row.packs_outstanding === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {row.packs_outstanding} packs
                        </div>
                        <div className="text-[10px] text-slate-500">Unaccounted</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 12. MANDI RATE COMPARISON */}
          {selectedReport === 'mandi_comparison' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                mandi_rate_comparison (Mandi Purchase vs Daily Average)
              </div>
              <div className="space-y-2">
                {Array.isArray(data) && data.map((item, i) => {
                  const row = item as {
                    biz_date: string;
                    product_name: string;
                    mandi: string;
                    qty: number;
                    rate_paise: number;
                    day_avg_paise: number;
                    diff_paise: number;
                  };
                  return (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <div>
                        <div className="font-semibold text-white text-sm">
                          {row.product_name} • <span className="text-emerald-400">{row.mandi}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {row.biz_date} • Rate: ₹{(row.rate_paise / 100).toFixed(2)} (Avg: ₹{(row.day_avg_paise / 100).toFixed(2)})
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${row.diff_paise <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {row.diff_paise <= 0 ? '' : '+'}₹{(row.diff_paise / 100).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500">vs Day Avg</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 13. NEGATIVE STOCK ALERTS */}
          {selectedReport === 'negative_stock' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                negative_stock_alerts (Lots with net negative movements)
              </div>
              {Array.isArray(data) && data.length === 0 ? (
                <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-6 text-center text-xs text-emerald-400">
                  ✓ No negative stock detected across all lots!
                </div>
              ) : (
                <div className="space-y-2">
                  {Array.isArray(data) && data.map((item, i) => {
                    const row = item as { product_id: string; lot_id: string; qty: number; products?: { name_en: string; unit: string } };
                    return (
                      <div key={i} className="flex items-center justify-between rounded-xl border border-rose-800 bg-rose-950/40 p-3">
                        <div>
                          <div className="font-bold text-rose-300 text-sm">{row.products?.name_en || 'Product'}</div>
                          <div className="text-xs text-rose-400">Lot: {row.lot_id}</div>
                        </div>
                        <div className="text-right font-black text-rose-400 text-base">
                          {row.qty} {row.products?.unit || 'kg'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
