import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * GET /api/buyer/plan?date=YYYY-MM-DD
 * Returns the buying plan for a given date from buying_plan_calc().
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // Call the buying_plan_calc function
  const { data, error } = await supabase.rpc('buying_plan_calc', { p_date: date });

  if (error) {
    console.error('buying_plan_calc error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also get today's purchases for progress
  const { data: purchases } = await supabase
    .from('purchases')
    .select('product_id, qty, rate_paise, lot_id')
    .eq('biz_date', date)
    .is('voided_at', null);

  // Aggregate purchases by product
  const purchasesByProduct: Record<string, { qty: number; amount: number }> = {};
  for (const p of purchases || []) {
    if (!purchasesByProduct[p.product_id]) {
      purchasesByProduct[p.product_id] = { qty: 0, amount: 0 };
    }
    purchasesByProduct[p.product_id].qty += Number(p.qty);
    purchasesByProduct[p.product_id].amount += Number(p.qty) * Number(p.rate_paise);
  }

  // Merge plan with purchases
  const plan = (data || []).map((row: Record<string, unknown>) => {
    const bought = purchasesByProduct[row.product_id as string] || { qty: 0, amount: 0 };
    return {
      ...row,
      qty_bought: bought.qty,
      avg_rate_paise: bought.qty > 0 ? bought.amount / bought.qty : null,
      qty_remaining: Math.max(0, Number(row.qty_to_buy) - bought.qty),
    };
  });

  return NextResponse.json(plan);
}
