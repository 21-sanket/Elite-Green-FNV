'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/src/lib/i18n';
import { useToday } from '@/src/lib/useToday';
import { BigNumberInput } from '@/src/components/BigNumberInput';
import { StatusBadge } from '@/src/components/StatusBadge';
import { enqueue, newId, getDeviceId } from '@/src/lib/sync';
import type { SyncStatus } from '@/src/lib/types';

interface TripLineItem {
  id: string;
  product_id: string;
  lot_id: string;
  qty_sent: number;
  unit: string;
  products?: {
    id: string;
    name_en: string;
    name_hi: string | null;
    unit: string;
  };
}

interface IncomingTrip {
  id: string;
  driver_name: string | null;
  event_at: string;
  biz_date: string;
  is_received: boolean;
  trip_lines: TripLineItem[];
}

export default function ReceiveTripPage() {
  const { t } = useI18n();
  const today = useToday();

  const [trips, setTrips] = useState<IncomingTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<IncomingTrip | null>(null);
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SyncStatus | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/supervisor/trips');
        if (!res.ok) throw new Error('Failed to load trips');
        const data = await res.json();
        if (!cancelled) setTrips(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectTrip = (trip: IncomingTrip) => {
    setSelectedTrip(trip);
    setValidationError(null);
    setSaveStatus(null);

    // Pre-fill received quantities with sent quantities
    const initQtys: Record<string, number> = {};
    for (const line of trip.trip_lines || []) {
      initQtys[line.id] = Number(line.qty_sent);
    }
    setReceivedQtys(initQtys);
  };

  const handleQtyChange = (lineId: string, val: number, maxSent: number) => {
    if (val > maxSent) {
      setValidationError('Received more than was sent. Check the numbers.');
    } else {
      setValidationError(null);
    }
    setReceivedQtys((prev) => ({ ...prev, [lineId]: val }));
  };

  const handleSaveReceipt = async () => {
    if (!selectedTrip) return;

    // Validate that received <= sent for all lines
    for (const line of selectedTrip.trip_lines) {
      const received = receivedQtys[line.id] ?? Number(line.qty_sent);
      if (received > Number(line.qty_sent)) {
        setValidationError('Received more than was sent. Check the numbers.');
        return;
      }
    }

    setSaving(true);
    setValidationError(null);

    try {
      const receiptId = newId();
      const deviceId = getDeviceId();
      const now = new Date().toISOString();
      const bizDate = today || now.slice(0, 10);

      // 1. Enqueue trip receipt
      await enqueue('trip_receipts', {
        id: receiptId,
        trip_id: selectedTrip.id,
        event_at: now,
        entered_at: now,
        biz_date: bizDate,
        entered_by: 'pending',
        channel: 'form',
        device_id: deviceId,
      });

      // 2. Enqueue trip receipt lines
      for (const line of selectedTrip.trip_lines) {
        const received = receivedQtys[line.id] ?? Number(line.qty_sent);
        await enqueue('trip_receipt_lines', {
          id: newId(),
          receipt_id: receiptId,
          trip_line_id: line.id,
          qty_received: received,
        });
      }

      setSaveStatus('synced');
      // Update local state to mark trip received
      setTrips((prev) =>
        prev.map((t) => (t.id === selectedTrip.id ? { ...t, is_received: true } : t)),
      );
      setTimeout(() => setSelectedTrip(null), 1200);
    } catch {
      setSaveStatus('failed');
    } finally {
      setSaving(false);
    }
  };

  const openTrips = trips.filter((t) => !t.is_received);
  const receivedTrips = trips.filter((t) => t.is_received);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">{t.common.loading}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">{t.supervisor.receive_title}</h2>
        <p className="text-xs text-slate-400">Receive mandi transport loads at the warehouse</p>
      </div>

      {/* Selected Trip Receiving Form */}
      {selectedTrip && (
        <div className="rounded-2xl border border-emerald-500/40 bg-slate-900/95 p-4 shadow-xl backdrop-blur-md">
          <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-semibold text-white">
                Trip: {selectedTrip.driver_name || 'Driver'}
              </h3>
              <p className="text-xs text-slate-400">
                {new Date(selectedTrip.event_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <button
              onClick={() => setSelectedTrip(null)}
              className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {selectedTrip.trip_lines.map((line) => {
              const productName = line.products?.name_en || 'Product';
              const productHi = line.products?.name_hi;
              const unit = line.unit || 'kg';
              const sent = Number(line.qty_sent);
              const received = receivedQtys[line.id] ?? sent;
              const transitLoss = sent - received;

              return (
                <div key={line.id} className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">{productName}</p>
                      {productHi && <p className="text-xs text-slate-400">{productHi}</p>}
                    </div>
                    <span className="text-xs rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                      Sent: {sent} {unit}
                    </span>
                  </div>

                  <BigNumberInput
                    value={received}
                    onChange={(val) => handleQtyChange(line.id, val, sent)}
                    label={t.supervisor.qty_received}
                    unit={unit}
                    min={0}
                    max={sent}
                    step={unit === 'pcs' ? 1 : 0.5}
                  />

                  {transitLoss > 0 && (
                    <div className="mt-2 flex items-center justify-between text-xs text-amber-400">
                      <span>Transit loss:</span>
                      <span className="font-bold">-{transitLoss.toFixed(1)} {unit}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {validationError && (
            <div className="mt-3 rounded-lg bg-red-500/10 p-2.5 text-center text-xs font-medium text-red-400">
              ⚠️ {validationError}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSaveReceipt}
              disabled={saving || Boolean(validationError)}
              className="flex-1 rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg
                         shadow-emerald-600/30 transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
            >
              {saving ? t.common.loading : t.supervisor.save_receipt}
            </button>
            {saveStatus && <StatusBadge status={saveStatus} />}
          </div>
        </div>
      )}

      {/* Open Trips List */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t.supervisor.open_trips} ({openTrips.length})
        </h3>

        {openTrips.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-8 text-center text-slate-500">
            <span className="text-3xl">🚛</span>
            <p className="mt-2 text-sm font-medium">No open trips waiting</p>
            <p className="text-xs text-slate-600">Loads sent from mandis will show up here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {openTrips.map((trip) => {
              const totalItems = trip.trip_lines?.length || 0;
              const isSelected = selectedTrip?.id === trip.id;

              return (
                <button
                  key={trip.id}
                  onClick={() => handleSelectTrip(trip)}
                  className={`w-full rounded-2xl border p-4 text-left transition-all backdrop-blur-sm
                    ${isSelected
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 active:scale-[0.98]'}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-white">
                        {trip.driver_name || 'Driver Load'}
                      </h4>
                      <p className="text-xs text-slate-400">
                        Date: {trip.biz_date} · {totalItems} items
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-400">
                      Pending
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800/60 pt-2.5">
                    {trip.trip_lines?.map((line) => (
                      <span
                        key={line.id}
                        className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
                      >
                        {line.products?.name_en || 'Item'}: {Number(line.qty_sent)} {line.unit}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Received Trips Archive */}
      {receivedTrips.length > 0 && (
        <div className="pt-2">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Received Today ({receivedTrips.length})
          </h3>
          <div className="space-y-2">
            {receivedTrips.map((trip) => (
              <div
                key={trip.id}
                className="flex items-center justify-between rounded-xl border border-slate-800/40 bg-slate-900/30 px-3.5 py-2.5 text-xs text-slate-400"
              >
                <div>
                  <span className="font-medium text-slate-300">
                    {trip.driver_name || 'Driver Load'}
                  </span>
                  <span className="ml-2 text-slate-500">({trip.trip_lines?.length || 0} items)</span>
                </div>
                <span className="text-emerald-400 font-medium">✓ Received</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
