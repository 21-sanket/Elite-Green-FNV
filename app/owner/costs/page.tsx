'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { useToday } from '@/src/lib/useToday';

interface CostType {
  id: string;
  name: string;
  kind: 'fixed' | 'variable';
}

interface CostItem {
  id: string;
  amount_paise: number;
  biz_date: string;
  note: string | null;
  event_at: string;
  cost_types?: { id: string; name: string; kind: 'fixed' | 'variable' };
  products?: { id: string; name_en: string; name_hi: string | null };
}

interface PaymentItem {
  id: string;
  amount_paise: number;
  source: string;
  reference: string | null;
  biz_date: string;
  note: string | null;
  event_at: string;
  deductions?: Array<{ id: string; type: string; amount_paise: number; note: string | null }>;
}

export default function OwnerCostsPage() {
  const { t, locale, formatPaise } = useI18n();
  const today = useToday();

  const [activeTab, setActiveTab] = useState<'cost' | 'payment' | 'ledger'>('cost');
  const [costTypes, setCostTypes] = useState<CostType[]>([]);
  const [costs, setCosts] = useState<CostItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cost form
  const [selectedCostTypeId, setSelectedCostTypeId] = useState<string>('');
  const [costAmountRupees, setCostAmountRupees] = useState<number>(500);
  const [costDate, setCostDate] = useState<string>(today || '2026-10-04');
  const [costNote, setCostNote] = useState<string>('');

  // Payment form
  const [payAmountRupees, setPayAmountRupees] = useState<number>(10000);
  const [payDate, setPayDate] = useState<string>(today || '2026-10-04');
  const [payReference, setPayReference] = useState<string>('');
  const [payNote, setPayNote] = useState<string>('');
  const [deductions, setDeductions] = useState<Array<{ type: string; amountRupees: number; note: string }>>([
    { type: 'Quality Penalty', amountRupees: 0, note: '' },
  ]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/costs-payments');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setCostTypes(json.cost_types || []);
      setCosts(json.costs || []);
      setPayments(json.payments || []);
      if (json.cost_types?.length > 0) {
        setSelectedCostTypeId((prev) => prev || json.cost_types[0].id);
      }
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load costs' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch('/api/owner/costs-payments')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!ignore) {
          setCostTypes(json.cost_types || []);
          setCosts(json.costs || []);
          setPayments(json.payments || []);
          if (json.cost_types?.length > 0) {
            setSelectedCostTypeId((prev) => prev || json.cost_types[0].id);
          }
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load costs' });
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleSaveCost = async () => {
    if (!selectedCostTypeId || costAmountRupees <= 0 || !costDate) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/owner/costs-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_cost',
          cost_type_id: selectedCostTypeId,
          amount_paise: Math.round(costAmountRupees * 100),
          biz_date: costDate,
          note: costNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      setMsg({
        type: 'success',
        text: locale === 'hi' ? 'लागत सुरक्षित हो गई!' : 'Cost recorded successfully!',
      });
      setCostNote('');
      await fetchData();
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record cost' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddDeductionRow = () => {
    setDeductions((prev) => [...prev, { type: 'Short Supply', amountRupees: 0, note: '' }]);
  };

  const handleUpdateDeduction = (idx: number, field: string, val: unknown) => {
    setDeductions((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleRemoveDeduction = (idx: number) => {
    setDeductions((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalDeductionsRupees = deductions.reduce((a, b) => a + (Number(b.amountRupees) || 0), 0);

  const handleSavePayment = async () => {
    if (payAmountRupees <= 0 || !payDate) return;
    setSaving(true);
    setMsg(null);
    try {
      const validDeductions = deductions
        .filter((d) => d.amountRupees > 0)
        .map((d) => ({
          type: d.type,
          amount_paise: Math.round(d.amountRupees * 100),
          note: d.note.trim() || undefined,
        }));

      const res = await fetch('/api/owner/costs-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_payment',
          amount_paise: Math.round(payAmountRupees * 100),
          source: 'flipkart',
          reference: payReference.trim() || undefined,
          biz_date: payDate,
          note: payNote.trim() || undefined,
          deductions: validDeductions,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      setMsg({
        type: 'success',
        text: locale === 'hi' ? 'भुगतान सुरक्षित हो गया!' : 'Payment recorded successfully!',
      });
      setPayReference('');
      setPayNote('');
      setDeductions([{ type: 'Quality Penalty', amountRupees: 0, note: '' }]);
      await fetchData();
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record payment' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub Tabs */}
      <div className="flex rounded-xl border border-slate-800 bg-slate-900/60 p-1">
        <button
          onClick={() => setActiveTab('cost')}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            activeTab === 'cost' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          💸 {locale === 'hi' ? 'लागत दर्ज करें' : 'Record Cost'}
        </button>
        <button
          onClick={() => setActiveTab('payment')}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            activeTab === 'payment' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          🏦 {locale === 'hi' ? 'Flipkart भुगतान' : 'Flipkart Payment'}
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            activeTab === 'ledger' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          📜 {locale === 'hi' ? 'लेखा बही' : 'Ledger'}
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
          {/* TAB 1: RECORD COST */}
          {activeTab === 'cost' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white">
                  {locale === 'hi' ? 'लागत दर्ज करें (Fixed / Variable)' : 'Record Operating Cost'}
                </h2>
                <p className="text-xs text-slate-400">
                  {locale === 'hi'
                    ? 'गाड़ी किराया, डीज़ल, हम्माली (Variable) या गोदाम किराया, वेतन (Fixed)'
                    : 'Transport/Diesel/Labor (Variable) or Warehouse Rent/Salaries (Fixed)'}
                </p>
              </div>

              {/* Cost Type Dropdown */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  {locale === 'hi' ? 'लागत प्रकार' : 'Cost Type'}
                </label>
                <select
                  value={selectedCostTypeId}
                  onChange={(e) => setSelectedCostTypeId(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  {costTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name} ({ct.kind.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount in Rupees */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  {locale === 'hi' ? 'रकम (₹)' : 'Amount (₹)'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="10"
                    value={costAmountRupees}
                    onChange={(e) => setCostAmountRupees(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-base font-bold text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <div className="flex gap-1.5">
                    {[100, 500, 1000].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setCostAmountRupees((prev) => prev + step)}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 active:scale-95"
                      >
                        +{step}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  {locale === 'hi' ? 'तारीख़' : 'Date'}
                </label>
                <input
                  type="date"
                  value={costDate}
                  onChange={(e) => setCostDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Note */}
              <div>
                <input
                  type="text"
                  value={costNote}
                  onChange={(e) => setCostNote(e.target.value)}
                  placeholder={locale === 'hi' ? 'विवरण / गाड़ी नंबर / रसीद' : 'Details / Vehicle number / Receipt note'}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveCost}
                disabled={saving || costAmountRupees <= 0}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
              >
                {saving ? t.common.loading : locale === 'hi' ? 'लागत सुरक्षित करें' : 'Record Cost'}
              </button>
            </div>
          )}

          {/* TAB 2: FLIPKART PAYMENT & DEDUCTIONS */}
          {activeTab === 'payment' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white">
                  {locale === 'hi' ? 'Flipkart भुगतान व कटौतियाँ' : 'Record Flipkart Payment'}
                </h2>
                <p className="text-xs text-slate-400">
                  {locale === 'hi'
                    ? 'बैंक खाते में प्राप्त वास्तविक राशि और स्टेटमेंट की कटौतियाँ दर्ज करें'
                    : 'Actual bank remittance received and penalty/TDS deductions'}
                </p>
              </div>

              {/* Amount received */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  {locale === 'hi' ? 'बैंक में प्राप्त राशि (₹)' : 'Net Amount Received in Bank (₹)'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={payAmountRupees}
                  onChange={(e) => setPayAmountRupees(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-base font-bold text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Date & Reference */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    {locale === 'hi' ? 'तारीख़' : 'Date'}
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    {locale === 'hi' ? 'UTR / संदर्भ संख्या' : 'UTR / Ref'}
                  </label>
                  <input
                    type="text"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder="NEFT/UTR..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Deductions section */}
              <div className="border-t border-slate-800 pt-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    {locale === 'hi' ? 'कटौतियाँ (Deductions)' : 'Deductions by Flipkart'}
                  </label>
                  <button
                    type="button"
                    onClick={handleAddDeductionRow}
                    className="rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-slate-700"
                  >
                    + Add Deduction
                  </button>
                </div>

                {deductions.map((d, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-xl bg-slate-900/60 p-2 border border-slate-800">
                    <select
                      value={d.type}
                      onChange={(e) => handleUpdateDeduction(idx, 'type', e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                    >
                      <option value="Quality Penalty">Quality Penalty</option>
                      <option value="Late Delivery">Late Delivery</option>
                      <option value="Short Supply">Short Supply</option>
                      <option value="TCS/TDS">TCS/TDS</option>
                      <option value="Packaging Dispute">Packaging Dispute</option>
                      <option value="Other">Other</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={d.amountRupees === 0 ? '' : d.amountRupees}
                      placeholder="₹ amount"
                      onChange={(e) => handleUpdateDeduction(idx, 'amountRupees', parseFloat(e.target.value) || 0)}
                      className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white text-right"
                    />
                    <input
                      type="text"
                      value={d.note}
                      placeholder="Note"
                      onChange={(e) => handleUpdateDeduction(idx, 'note', e.target.value)}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white placeholder-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveDeduction(idx)}
                      className="text-slate-400 hover:text-rose-400 text-sm px-1"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {/* Summary calculation */}
                <div className="rounded-xl bg-slate-800/40 p-3 text-xs space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Bank Remittance:</span>
                    <span className="font-semibold text-white">₹{payAmountRupees.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Total Deductions:</span>
                    <span className="font-semibold text-rose-400">+₹{totalDeductionsRupees.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-700/60 pt-1 font-bold text-sm text-emerald-400">
                    <span>Gross Accounted:</span>
                    <span>₹{(payAmountRupees + totalDeductionsRupees).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSavePayment}
                disabled={saving || payAmountRupees <= 0}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
              >
                {saving ? t.common.loading : locale === 'hi' ? 'भुगतान सुरक्षित करें' : 'Record Payment'}
              </button>
            </div>
          )}

          {/* TAB 3: LEDGER */}
          {activeTab === 'ledger' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {locale === 'hi' ? 'हाल की लागतें' : 'Recent Operating Costs'}
                </h3>
                <div className="space-y-2">
                  {costs.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{c.cost_types?.name}</span>
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 uppercase">
                            {c.cost_types?.kind}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {c.biz_date} {c.note && `• ${c.note}`}
                        </div>
                      </div>
                      <div className="text-base font-bold text-rose-400">
                        -{formatPaise(c.amount_paise)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {locale === 'hi' ? 'हाल के भुगतान' : 'Recent Payments & Deductions'}
                </h3>
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-white text-sm">
                            {p.source.toUpperCase()} {p.reference && `• Ref: ${p.reference}`}
                          </div>
                          <div className="text-xs text-slate-400">{p.biz_date}</div>
                        </div>
                        <div className="text-base font-bold text-emerald-400">
                          +{formatPaise(p.amount_paise)}
                        </div>
                      </div>

                      {p.deductions && p.deductions.length > 0 && (
                        <div className="border-t border-slate-800/60 pt-1.5 space-y-1">
                          {p.deductions.map((d) => (
                            <div key={d.id} className="flex justify-between text-xs text-slate-400">
                              <span>↳ Deduction: {d.type}</span>
                              <span className="text-rose-400">-{formatPaise(d.amount_paise)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
