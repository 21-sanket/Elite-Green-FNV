import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * GET /api/owner/orders?date=YYYY-MM-DD
 * Fetches:
 * - SKUs with products
 * - Today's orders & order lines
 * - Existing buying plan and plan lines
 *
 * POST /api/owner/orders
 * Action 'save_order': Save order with order_lines
 * Action 'approve_plan': Run buying_plan_calc(date), create/update buying_plans & plan_lines
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // 1. Fetch SKUs
  const { data: skus, error: skuErr } = await supabase
    .from('skus')
    .select(`
      id, label, base_qty_per_pack, active,
      products ( id, name_en, name_hi, unit, avg_weight_kg )
    `)
    .eq('active', true)
    .order('label');

  if (skuErr) return NextResponse.json({ error: skuErr.message }, { status: 500 });

  // 2. Fetch orders for date
  const { data: orders, error: orderErr } = await supabase
    .from('orders')
    .select(`
      id, delivery_date, entered_at, note,
      order_lines ( id, sku_id, packs_ordered )
    `)
    .eq('delivery_date', date)
    .is('voided_at', null);

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

  // 3. Fetch buying plan
  const { data: plan } = await supabase
    .from('buying_plans')
    .select(`
      id, plan_date, approved_at, approved_by,
      plan_lines ( id, product_id, order_qty, extra_pct, fresh_stock_qty, qty_to_buy )
    `)
    .eq('plan_date', date)
    .maybeSingle();

  // 4. Calculate buying plan preview
  const { data: calcResult } = await supabase.rpc('buying_plan_calc', { p_date: date });

  return NextResponse.json({
    skus: skus || [],
    orders: orders || [],
    buying_plan: plan || null,
    preview_plan: calcResult || [],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const supabase = await createServiceRoleClient();

    // Find an owner user ID
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

    if (action === 'save_order') {
      const { delivery_date, lines, note } = body;
      if (!delivery_date || !lines || lines.length === 0) {
        return NextResponse.json({ error: 'delivery_date and lines are required' }, { status: 400 });
      }

      // Filter lines with positive packs
      const validLines = lines.filter((l: { sku_id: string; packs_ordered: number }) => Number(l.packs_ordered) > 0);
      if (validLines.length === 0) {
        return NextResponse.json({ error: 'At least one SKU must have packs > 0' }, { status: 400 });
      }

      // Insert header into orders
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          delivery_date,
          entered_by: ownerId,
          channel: 'form',
          note: note || null,
        })
        .select('id')
        .single();

      if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

      // Insert lines
      const lineRows = validLines.map((l: { sku_id: string; packs_ordered: number }) => ({
        order_id: order.id,
        sku_id: l.sku_id,
        packs_ordered: Number(l.packs_ordered),
      }));

      const { error: lineErr } = await supabase.from('order_lines').insert(lineRows);
      if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

      return NextResponse.json({ success: true, order_id: order.id });
    }

    if (action === 'approve_plan') {
      const { plan_date } = body;
      if (!plan_date) {
        return NextResponse.json({ error: 'plan_date is required' }, { status: 400 });
      }

      // Calculate the plan
      const { data: calc, error: calcErr } = await supabase.rpc('buying_plan_calc', { p_date: plan_date });
      if (calcErr) return NextResponse.json({ error: calcErr.message }, { status: 500 });

      // Create or update buying_plans
      const { data: newPlan, error: planErr } = await supabase
        .from('buying_plans')
        .insert({
          plan_date,
          approved_by: ownerId,
          approved_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });

      // Insert plan lines
      if (calc && calc.length > 0) {
        const planLineRows = calc.map((c: {
          product_id: string;
          order_qty: number;
          extra_pct: number;
          fresh_stock: number;
          qty_to_buy: number;
        }) => ({
          plan_id: newPlan.id,
          product_id: c.product_id,
          order_qty: Number(c.order_qty) || 0,
          extra_pct: Number(c.extra_pct) || 0,
          fresh_stock_qty: Number(c.fresh_stock) || 0,
          qty_to_buy: Number(c.qty_to_buy) || 0,
        }));

        await supabase.from('plan_lines').insert(planLineRows);
      }

      return NextResponse.json({ success: true, plan_id: newPlan.id });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
