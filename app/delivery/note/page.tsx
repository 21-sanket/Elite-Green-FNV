'use client';

import { useEffect, useState, useRef } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { useToday } from '@/src/lib/useToday';
import { StatusBadge } from '@/src/components/StatusBadge';
import { resizeImageFile } from '@/src/lib/imageResize';
import { enqueue, newId, getDeviceId } from '@/src/lib/sync';
import type { SyncStatus } from '@/src/lib/types';
import type { PhotoRowResult } from '@/app/api/read-photo/route';

interface SkuReference {
  id: string;
  product_id: string;
  label: string;
  products?: {
    id: string;
    name_en: string;
  };
}

const REJECTION_REASONS = [
  'size',
  'freshness',
  'damage',
  'colour',
  'weight_count',
  'short_supply',
  'late',
  'other',
] as const;

export default function DeliveryNotePage() {
  const { t } = useI18n();
  const today = useToday();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reference SKUs
  const [skus, setSkus] = useState<SkuReference[]>([]);

  // Photo & OCR state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  // Review Table state
  const [deliveryDate, setDeliveryDate] = useState('');
  const [flipkartRef, setFlipkartRef] = useState('');
  const [printedTotal, setPrintedTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<PhotoRowResult[]>([]);

  // Submission state
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SyncStatus | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    async function loadSkus() {
      try {
        const res = await fetch('/api/reference?tables=products,skus');
        const data = await res.json();
        // Map products into skus
        const productsMap = new Map((data.products || []).map((p: { id: string; name_en: string }) => [p.id, p]));
        const enriched = (data.skus || []).map((s: SkuReference) => ({
          ...s,
          products: productsMap.get(s.product_id),
        }));
        setSkus(enriched);
      } catch (err) {
        console.error('Failed to load reference SKUs', err);
      }
    }
    loadSkus();
  }, []);

  // Handle Photo selection & resize
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setReading(true);
      setSaveStatus(null);
      setSavedSuccess(false);

      // 1. Resize on client to <=1800px
      const { base64, mimeType } = await resizeImageFile(file, 1800);
      setImagePreview(`data:${mimeType};base64,${base64}`);

      // 2. Call OCR / Vision endpoint
      const res = await fetch('/api/read-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          type: 'delivery_note',
        }),
      });

      if (!res.ok) throw new Error('Failed to read photo');
      const result = await res.json();

      setDeliveryDate(result.date || today || new Date().toISOString().slice(0, 10));
      setPrintedTotal(result.printedTotal);
      setRows(result.rows || []);
      setIsDemo(Boolean(result.isDemoFallback));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error reading photo');
    } finally {
      setReading(false);
    }
  };

  // Cell editing handlers
  const handleUpdateRow = (index: number, field: keyof PhotoRowResult, value: unknown) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    );
  };

  // Match row product & pack to database SKU
  const findSkuId = (productName: string, packLabel: string): string | null => {
    const cleanProd = productName.trim().toLowerCase();
    const cleanPack = packLabel.trim().toLowerCase();

    const match = skus.find((s) => {
      const pName = (s.products?.name_en || '').toLowerCase();
      const sLabel = (s.label || '').toLowerCase();
      return pName === cleanProd && sLabel === cleanPack;
    });

    return match?.id || null;
  };

  // Validation metrics
  const totalPrinted = rows.reduce((sum, r) => sum + Number(r.printed || 0), 0);
  const totalAccepted = rows.reduce((sum, r) => sum + Number(r.accepted || 0), 0);
  const hasMismatchTotal = printedTotal !== null && totalPrinted !== printedTotal;
  const uncertainCount = rows.filter((r) => r.uncertain).length;

  // Confirm and Save
  const handleConfirmSave = async () => {
    if (rows.length === 0) return;

    setSaving(true);
    try {
      const noteId = newId();
      const deviceId = getDeviceId();
      const now = new Date().toISOString();
      const bizDate = deliveryDate || today || now.slice(0, 10);

      // 1. Enqueue delivery_notes
      await enqueue('delivery_notes', {
        id: noteId,
        delivery_date: bizDate,
        flipkart_ref: flipkartRef || null,
        status: 'confirmed',
        event_at: now,
        entered_at: now,
        biz_date: bizDate,
        entered_by: 'pending',
        channel: 'photo',
        device_id: deviceId,
      });

      // 2. Enqueue delivery_note_lines
      for (const row of rows) {
        const skuId = findSkuId(row.product, row.pack);
        if (!skuId) {
          console.warn(`Could not find SKU for ${row.product} ${row.pack}`);
          continue;
        }

        const printedQty = Math.round(Number(row.printed));
        const acceptedQty = Math.round(Number(row.accepted));
        const reason = acceptedQty < printedQty ? row.reason || 'other' : null;

        await enqueue('delivery_note_lines', {
          id: newId(),
          note_id: noteId,
          sku_id: skuId,
          printed_qty: printedQty,
          accepted_qty: acceptedQty,
          reason,
        });
      }

      setSaveStatus('synced');
      setSavedSuccess(true);
    } catch {
      setSaveStatus('failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Photo Capture Section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white">{t.delivery.title}</h2>
            <p className="text-xs text-slate-400">Photograph the signed Flipkart delivery note</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={reading}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-lg
                       shadow-emerald-600/30 transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
          >
            <span>📷</span>
            <span>{imagePreview ? 'Retake' : t.delivery.take_photo}</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {reading && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-slate-800/80 p-6 text-sm text-emerald-400">
            <span className="animate-spin text-lg">↻</span>
            <span>{t.delivery.reading}</span>
          </div>
        )}

        {imagePreview && !reading && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-950 p-2 border border-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Delivery note thumbnail"
              className="h-16 w-16 rounded-lg object-cover border border-slate-700"
            />
            <div className="text-xs">
              <p className="font-semibold text-slate-200">Delivery note captured</p>
              {isDemo && (
                <p className="text-amber-400">Demo OCR mode (Ready for review)</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* REVIEW TABLE SECTION */}
      {rows.length > 0 && !reading && (
        <div className="space-y-4">
          {/* Header controls: Date & Ref */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <h3 className="font-bold text-white">{t.delivery.review_title}</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400">Date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400">Flipkart Ref #</label>
                <input
                  type="text"
                  placeholder="e.g. DN-1004"
                  value={flipkartRef}
                  onChange={(e) => setFlipkartRef(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500"
                />
              </div>
            </div>

            {/* Validation Alerts */}
            {hasMismatchTotal && (
              <div className="rounded-xl bg-red-500/10 p-2.5 text-xs text-red-400 border border-red-500/20">
                ⚠️ {t.delivery.total_mismatch}: Sum of rows ({totalPrinted}) differs from printed total ({printedTotal}).
              </div>
            )}

            {uncertainCount > 0 && (
              <div className="rounded-xl bg-amber-500/10 p-2.5 text-xs text-amber-400 border border-amber-500/20">
                ⚠️ {uncertainCount} row(s) flagged as uncertain handwriting. Please check and correct below.
              </div>
            )}
          </div>

          {/* Editable Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/60 font-semibold text-slate-400">
                  <tr>
                    <th className="p-3">{t.delivery.product}</th>
                    <th className="p-3 text-center">{t.delivery.printed}</th>
                    <th className="p-3 text-center">{t.delivery.accepted}</th>
                    <th className="p-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {rows.map((row, index) => {
                    const isUncertain = row.uncertain;
                    const isShortfall = row.accepted < row.printed;
                    const isOver = row.accepted > row.printed;

                    return (
                      <tr
                        key={index}
                        className={`transition-colors
                          ${isUncertain ? 'bg-amber-500/10' : ''}
                          ${isOver ? 'bg-red-500/10' : ''}`}
                      >
                        {/* Product & Pack */}
                        <td className="p-3">
                          <p className="font-semibold text-white leading-tight">{row.product}</p>
                          <p className="text-slate-400 text-[11px]">{row.pack}</p>
                          {isUncertain && (
                            <span className="mt-0.5 inline-block rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-400">
                              Check digit
                            </span>
                          )}
                        </td>

                        {/* Printed Indent */}
                        <td className="p-3 text-center font-bold text-slate-300">
                          <input
                            type="number"
                            value={row.printed}
                            onChange={(e) =>
                              handleUpdateRow(index, 'printed', Number(e.target.value))
                            }
                            className="w-14 rounded-lg border border-slate-700 bg-slate-800 py-1 text-center font-bold text-white focus:border-emerald-500"
                          />
                        </td>

                        {/* Accepted Qty */}
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            value={row.accepted}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              handleUpdateRow(index, 'accepted', val);
                              if (val >= row.printed) {
                                handleUpdateRow(index, 'reason', null);
                              }
                            }}
                            className={`w-14 rounded-lg border py-1 text-center font-bold text-white focus:outline-none
                              ${isShortfall ? 'border-amber-500/60 bg-amber-950/30 text-amber-300' : 'border-slate-700 bg-slate-800 text-white'}`}
                          />
                        </td>

                        {/* Rejection / Shortfall Reason */}
                        <td className="p-3">
                          {isShortfall ? (
                            <select
                              value={row.reason || 'size'}
                              onChange={(e) =>
                                handleUpdateRow(index, 'reason', e.target.value)
                              }
                              className="rounded-lg border border-amber-500/40 bg-slate-800 px-2 py-1 text-xs text-amber-300 focus:outline-none"
                            >
                              {REJECTION_REASONS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-emerald-400 font-bold">✓ 100%</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary Row */}
            <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/80 px-4 py-3 text-xs font-bold text-slate-300">
              <span>Total: {rows.length} SKUs</span>
              <div className="flex items-center gap-3">
                <span>Ordered: {totalPrinted}</span>
                <span className="text-emerald-400">Accepted: {totalAccepted}</span>
              </div>
            </div>
          </div>

          {/* Confirm & Save Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleConfirmSave}
              disabled={saving || savedSuccess}
              className="flex-1 rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg
                         shadow-emerald-600/30 transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
            >
              {saving ? t.common.loading : savedSuccess ? '✓ Saved to Ledger' : t.delivery.confirm}
            </button>
            {saveStatus && <StatusBadge status={saveStatus} />}
          </div>

          {savedSuccess && (
            <div className="rounded-xl bg-emerald-500/10 p-3 text-center text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              Delivery note confirmed and saved into append-only ledger! Fill rates and quality metrics are now updated.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
