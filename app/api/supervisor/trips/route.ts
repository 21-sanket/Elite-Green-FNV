import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * GET /api/supervisor/trips?date=YYYY-MM-DD
 * Returns trips for the supervisor:
 * - leg = 'to_warehouse'
 * - includes trip_lines, product details, and whether a receipt already exists
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  const supabase = await createServiceRoleClient();

  let query = supabase
    .from('trips')
    .select(`
      id, leg, driver_name, vehicle_note, event_at, biz_date,
      trip_lines (
        id, product_id, lot_id, qty_sent, unit,
        products ( id, name_en, name_hi, unit )
      ),
      trip_receipts ( id, event_at, voided_at )
    `)
    .eq('leg', 'to_warehouse')
    .is('voided_at', null)
    .order('event_at', { ascending: false });

  if (date) {
    query = query.eq('biz_date', date);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Format with a clean `is_received` flag
  const formatted = (data || []).map((t) => {
    const receipts = (t.trip_receipts as Array<{ id: string; voided_at: string | null }>) || [];
    const activeReceipt = receipts.find((r) => !r.voided_at);
    return {
      ...t,
      is_received: Boolean(activeReceipt),
      receipt_id: activeReceipt?.id || null,
    };
  });

  return NextResponse.json(formatted);
}
