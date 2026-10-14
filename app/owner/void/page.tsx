'use client';

import { useState } from 'react';
import { useI18n } from '@/src/lib/i18n';

const VOIDABLE_OPTIONS = [
  { table: 'purchases', labelEn: 'Mandi Purchase', labelHi: 'मंडी खरीद' },
  { table: 'orders', labelEn: 'Flipkart Order', labelHi: 'ऑर्डर' },
  { table: 'pack_runs', labelEn: 'Pack Run', labelHi: 'पैकिंग रन' },
  { table: 'delivery_notes', labelEn: 'Delivery Note', labelHi: 'डिलीवरी नोट' },
  { table: 'stock_counts', labelEn: 'Evening Stock Count', labelHi: 'स्टॉक गणना' },
  { table: 'local_sales', labelEn: 'Local Market Sale', labelHi: 'लोकल बिक्री' },
  { table: 'costs', labelEn: 'Operating Cost', labelHi: 'लागत' },
  { table: 'payments', labelEn: 'Flipkart Payment', labelHi: 'भुगतान' },
  { table: 'trip_receipts', labelEn: 'Warehouse Receipt', labelHi: 'वेयरहाउस रसीद' },
  { table: 'trips', labelEn: 'Transit Trip', labelHi: 'ट्रिप' },
];

export default function OwnerVoidPage() {
  const { t, locale } = useI18n();
  const [selectedTable, setSelectedTable] = useState<string>('purchases');
  const [recordId, setRecordId] = useState<string>('');
  const [voidReason, setVoidReason] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordId.trim() || !voidReason.trim()) return;

    const confirmed = window.confirm(
      locale === 'hi'
        ? `क्या आप वाकई इस रिकॉर्ड को रद्द करना चाहते हैं? इससे सभी संबंधित स्टॉक हलचलें स्वतः उलट दी जाएंगी।`
        : `Are you sure you want to void this record? This will trigger an immediate stock reversal.`,
    );

    if (!confirmed) return;

    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/owner/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: selectedTable,
          id: recordId.trim(),
          void_reason: voidReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setMsg({
        type: 'success',
        text:
          locale === 'hi'
            ? `रिकॉर्ड सफलता से रद्द हो गया। ऑडिट लॉग दर्ज हुआ और स्टॉक उलट दिया गया।`
            : `Record successfully voided. Audit log saved and stock reversed.`,
      });
      setRecordId('');
      setVoidReason('');
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to void record' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-rose-900/60 bg-rose-950/30 p-4 space-y-2">
        <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
          <span>⚠️</span> {locale === 'hi' ? 'अपरिवर्तनीय लेज़र सुरक्षा' : 'Append-Only Ledger Guard'}
        </div>
        <p className="text-xs text-rose-200/90 leading-relaxed">
          {locale === 'hi'
            ? 'FNV Daily Ops में कोई भी रिकॉर्ड सीधे एडिट या डिलीट नहीं किया जा सकता। किसी गलत प्रविष्टि को सुधारने के लिए उसे कारण सहित "रद्द (Void)" किया जाता है। डेटाबेस ट्रिगर्स सभी संबंधित स्टॉक मूवमेंट्स को स्वतः उलट देते हैं और ऑडिट लॉग में एंट्री दर्ज करते हैं।'
            : 'Records in FNV Daily Ops cannot be edited or deleted. Voiding permanently marks the row as voided, requires an explicit reason, logs the action to audit_log, and triggers an exact reversal of all posted stock movements.'}
        </p>
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

      <form onSubmit={handleVoid} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
        <h2 className="text-sm font-bold text-white">
          {locale === 'hi' ? 'रिकॉर्ड रद्द करने का फ़ॉर्म' : 'Void Record Form'}
        </h2>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            {locale === 'hi' ? 'तालिका (प्रकार)' : 'Record Type (Table)'}
          </label>
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-rose-500 focus:outline-none"
          >
            {VOIDABLE_OPTIONS.map((opt) => (
              <option key={opt.table} value={opt.table}>
                {locale === 'hi' ? opt.labelHi : opt.labelEn} ({opt.table})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            {locale === 'hi' ? 'रिकॉर्ड ID (UUID)' : 'Record ID (UUID)'}
          </label>
          <input
            type="text"
            required
            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs font-mono text-white placeholder-slate-600 focus:border-rose-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            {t.common.void_reason} <span className="text-rose-400">*</span>
          </label>
          <textarea
            required
            rows={3}
            placeholder={
              locale === 'hi'
                ? 'रद्द करने का अनिवार्य कारण लिखें (जैसे: गलत वज़न दर्ज, दोहराव)...'
                : 'Mandatory reason for voiding (e.g. incorrect weight entered, duplicate receipt)...'
            }
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:border-rose-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving || !recordId.trim() || !voidReason.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-rose-700 to-rose-600 py-3 font-semibold text-white shadow-lg shadow-rose-900/30 active:scale-95 disabled:opacity-50"
        >
          {saving ? t.common.loading : locale === 'hi' ? 'रिकॉर्ड रद्द करें (Void)' : 'Confirm & Void Record'}
        </button>
      </form>
    </div>
  );
}
