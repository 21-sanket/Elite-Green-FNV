import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

const VOIDABLE_TABLES = new Set([
  'orders',
  'purchases',
  'trips',
  'trip_receipts',
  'pack_runs',
  'delivery_notes',
  'stock_counts',
  'local_sales',
  'costs',
  'payments',
]);

/**
 * POST /api/owner/void
 * Body: { table: string, id: string, void_reason: string }
 * Sets voided_at, voided_by, void_reason on the record.
 * Database triggers ledger_guard and reverse_movements_on_void handle audit and stock reversal.
 */
export async function POST(request: NextRequest) {
  try {
    const { table, id, void_reason } = await request.json();

    if (!table || !id || !void_reason || !void_reason.trim()) {
      return NextResponse.json(
        { error: 'table, id, and non-empty void_reason are required' },
        { status: 400 },
      );
    }

    if (!VOIDABLE_TABLES.has(table)) {
      return NextResponse.json(
        { error: `Table "${table}" cannot be voided` },
        { status: 400 },
      );
    }

    const supabase = await createServiceRoleClient();

    // Find owner user ID
    const { data: owners } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'owner')
      .eq('active', true)
      .limit(1);

    let ownerId = owners?.[0]?.id;
    if (!ownerId) {
      const { data: anyUser } = await supabase.from('users').select('id').limit(1);
      ownerId = anyUser?.[0]?.id;
    }

    if (!ownerId) {
      return NextResponse.json({ error: 'No user found' }, { status: 500 });
    }

    // Execute update with voided_at, voided_by, and void_reason
    const { data, error } = await supabase
      .from(table)
      .update({
        voided_at: new Date().toISOString(),
        voided_by: ownerId,
        void_reason: void_reason.trim(),
      })
      .eq('id', id)
      .is('voided_at', null)
      .select('id, voided_at, void_reason')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      table,
      record: data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
