import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * POST /api/sync
 * Receives a single record from the offline queue and inserts it into Postgres.
 * Idempotent: if the `id` already exists, returns 200 (no duplicate).
 *
 * Body: { table: string, data: Record<string, unknown> }
 */

// Tables that can be synced from the client
const ALLOWED_TABLES = new Set([
  'purchases',
  'trips',
  'trip_lines',
  'trip_receipts',
  'trip_receipt_lines',
  'pack_runs',
  'pack_run_lots',
  'delivery_notes',
  'delivery_note_lines',
  'stock_counts',
  'stock_count_lines',
  'local_sales',
  'costs',
  'payments',
  'deductions',
  'orders',
  'order_lines',
  'media',
]);

export async function POST(request: NextRequest) {
  try {
    const { table, data } = await request.json();

    if (!table || !data) {
      return NextResponse.json(
        { error: 'Missing table or data' },
        { status: 400 },
      );
    }

    if (!ALLOWED_TABLES.has(table)) {
      return NextResponse.json(
        { error: `Table "${table}" is not allowed for sync` },
        { status: 400 },
      );
    }

    if (!data.id) {
      return NextResponse.json(
        { error: 'Record must have an id' },
        { status: 400 },
      );
    }

    const supabase = await createServiceRoleClient();

    // Idempotent: check if record already exists
    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq('id', data.id)
      .maybeSingle();

    if (existing) {
      // Already saved — return success (idempotent)
      return NextResponse.json({ status: 'already_exists', id: data.id });
    }

    // Insert the record
    const { error } = await supabase.from(table).insert(data);

    if (error) {
      console.error(`Sync insert error for ${table}:`, error);

      // Check for unique constraint violation (another idempotency check)
      if (error.code === '23505') {
        return NextResponse.json({ status: 'already_exists', id: data.id });
      }

      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 422 },
      );
    }

    return NextResponse.json({ status: 'inserted', id: data.id });
  } catch (err) {
    console.error('Sync endpoint error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
