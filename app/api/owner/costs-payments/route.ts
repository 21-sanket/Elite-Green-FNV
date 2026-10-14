import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * GET /api/owner/costs-payments?date=YYYY-MM-DD&month=YYYY-MM
 * Fetches:
 * - cost_types list
 * - recent costs
 * - recent payments with deductions
 *
 * POST /api/owner/costs-payments
 * Action 'add_cost': Record fixed or variable cost
 * Action 'add_payment': Record payment and deductions
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  const month = request.nextUrl.searchParams.get('month');

  const supabase = await createServiceRoleClient();

  // 1. Fetch cost types
  const { data: costTypes } = await supabase
    .from('cost_types')
    .select('*')
    .order('name');

  // 2. Fetch costs
  let costsQuery = supabase
    .from('costs')
    .select(`
      id, amount_paise, biz_date, note, event_at,
      cost_types ( id, name, kind ),
      products ( id, name_en, name_hi )
    `)
    .is('voided_at', null)
    .order('event_at', { ascending: false });

  if (date) costsQuery = costsQuery.eq('biz_date', date);
  if (month) costsQuery = costsQuery.gte('biz_date', `${month}-01`).lte('biz_date', `${month}-31`);

  const { data: costs } = await costsQuery.limit(50);

  // 3. Fetch payments with deductions
  let paymentsQuery = supabase
    .from('payments')
    .select(`
      id, amount_paise, source, reference, biz_date, note, event_at,
      deductions ( id, type, amount_paise, note )
    `)
    .is('voided_at', null)
    .order('event_at', { ascending: false });

  if (date) paymentsQuery = paymentsQuery.eq('biz_date', date);
  if (month) paymentsQuery = paymentsQuery.gte('biz_date', `${month}-01`).lte('biz_date', `${month}-31`);

  const { data: payments } = await paymentsQuery.limit(50);

  return NextResponse.json({
    cost_types: costTypes || [],
    costs: costs || [],
    payments: payments || [],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
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

    if (action === 'add_cost') {
      const { cost_type_id, amount_paise, biz_date, product_id, note } = body;
      if (!cost_type_id || !amount_paise || amount_paise <= 0 || !biz_date) {
        return NextResponse.json(
          { error: 'cost_type_id, amount_paise > 0, and biz_date are required' },
          { status: 400 },
        );
      }

      const { data: cost, error } = await supabase
        .from('costs')
        .insert({
          cost_type_id,
          amount_paise,
          biz_date,
          product_id: product_id || null,
          entered_by: ownerId,
          channel: 'form',
          note: note || null,
        })
        .select('*')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, cost });
    }

    if (action === 'add_payment') {
      const { amount_paise, source = 'flipkart', reference, biz_date, note, deductions = [] } = body;
      if (!amount_paise || amount_paise <= 0 || !biz_date) {
        return NextResponse.json(
          { error: 'amount_paise > 0 and biz_date are required' },
          { status: 400 },
        );
      }

      // Insert payment
      const { data: payment, error: payErr } = await supabase
        .from('payments')
        .insert({
          amount_paise,
          source,
          reference: reference || null,
          biz_date,
          entered_by: ownerId,
          channel: 'form',
          note: note || null,
        })
        .select('id')
        .single();

      if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });

      // Insert deductions if any
      const validDeductions = deductions.filter(
        (d: { type: string; amount_paise: number }) => Number(d.amount_paise) > 0,
      );

      if (validDeductions.length > 0) {
        const dedRows = validDeductions.map((d: { type: string; amount_paise: number; note?: string }) => ({
          payment_id: payment.id,
          type: d.type,
          amount_paise: Number(d.amount_paise),
          note: d.note || null,
        }));

        const { error: dedErr } = await supabase.from('deductions').insert(dedRows);
        if (dedErr) return NextResponse.json({ error: dedErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, payment_id: payment.id });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
