import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * GET /api/seller/stock?date=YYYY-MM-DD
 * Returns:
 * - products with stock_on_hand breakdown (local_only, fresh, total)
 * - last sold rate per product
 * - today's local sales and summary totals
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // 1. Fetch all active products
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name_en, name_hi, unit, avg_weight_kg')
    .eq('active', true)
    .order('name_en');

  if (prodErr) {
    return NextResponse.json({ error: prodErr.message }, { status: 500 });
  }

  // 2. Fetch stock_on_hand view
  const { data: stockData, error: stockErr } = await supabase
    .from('stock_on_hand')
    .select('product_id, lot_id, lot_date, kind, state, qty, value_paise');

  if (stockErr) {
    return NextResponse.json({ error: stockErr.message }, { status: 500 });
  }

  // 3. Fetch latest local sales rates for all products to prefill
  const { data: recentSales } = await supabase
    .from('local_sales')
    .select('product_id, rate_paise, event_at')
    .is('voided_at', null)
    .order('event_at', { ascending: false });

  const lastRateMap: Record<string, number> = {};
  for (const sale of recentSales || []) {
    if (!lastRateMap[sale.product_id]) {
      lastRateMap[sale.product_id] = Number(sale.rate_paise);
    }
  }

  // 4. Summarize stock by product
  const stockByProduct: Record<
    string,
    {
      local_only: number;
      fresh: number;
      total: number;
      lots: Array<{ lot_id: string; lot_date: string; state: string; qty: number }>;
    }
  > = {};

  for (const row of stockData || []) {
    const pid = row.product_id;
    if (!stockByProduct[pid]) {
      stockByProduct[pid] = { local_only: 0, fresh: 0, total: 0, lots: [] };
    }
    const q = Number(row.qty);
    if (row.state === 'local_only') {
      stockByProduct[pid].local_only += q;
    } else if (row.state === 'fresh') {
      stockByProduct[pid].fresh += q;
    }
    stockByProduct[pid].total += q;
    stockByProduct[pid].lots.push({
      lot_id: row.lot_id,
      lot_date: row.lot_date,
      state: row.state,
      qty: q,
    });
  }

  // 5. Fetch today's local sales
  const { data: todaySales, error: salesErr } = await supabase
    .from('local_sales')
    .select(`
      id, product_id, lot_id, from_state, qty, rate_paise, amount_paise,
      pay_mode, event_at, biz_date, note,
      products ( id, name_en, name_hi, unit )
    `)
    .eq('biz_date', date)
    .is('voided_at', null)
    .order('event_at', { ascending: false });

  if (salesErr) {
    return NextResponse.json({ error: salesErr.message }, { status: 500 });
  }

  let totalCashPaise = 0;
  let totalCreditPaise = 0;
  let totalQtySold = 0;

  for (const s of todaySales || []) {
    const amt = Number(s.amount_paise) || 0;
    const q = Number(s.qty) || 0;
    totalQtySold += q;
    if (s.pay_mode === 'cash') {
      totalCashPaise += amt;
    } else {
      totalCreditPaise += amt;
    }
  }

  // Build product stock list
  const productStockList = products.map((p) => {
    const s = stockByProduct[p.id] || { local_only: 0, fresh: 0, total: 0, lots: [] };
    return {
      id: p.id,
      name_en: p.name_en,
      name_hi: p.name_hi,
      unit: p.unit,
      avg_weight_kg: p.avg_weight_kg,
      local_only_qty: Math.max(0, s.local_only),
      fresh_qty: Math.max(0, s.fresh),
      total_qty: Math.max(0, s.total),
      last_rate_paise: lastRateMap[p.id] ?? 0,
    };
  });

  return NextResponse.json({
    products: productStockList,
    today_sales: todaySales || [],
    summary: {
      total_cash_paise: totalCashPaise,
      total_credit_paise: totalCreditPaise,
      total_amount_paise: totalCashPaise + totalCreditPaise,
      total_qty_sold: totalQtySold,
      count_sales: (todaySales || []).length,
    },
  });
}
