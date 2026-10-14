import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * GET /api/owner/dashboard?date=YYYY-MM-DD
 * Aggregates high-level metrics for the Owner Dashboard directly from SQL views & tables:
 * - Fill rate today & 7-day average
 * - Today's profit & cash flow
 * - Order vs Bought vs Packed vs Delivered kg totals
 * - Missing monthly kg estimate alert
 * - Items needing review (inbox_items)
 * - Negative stock alerts
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // 1. Check monthly kg estimate for this month
  const monthStart = `${date.substring(0, 7)}-01`;
  const { data: kgEst } = await supabase
    .from('kg_estimates')
    .select('month, kg')
    .eq('month', monthStart)
    .maybeSingle();

  const missingKgEstimate = !kgEst;

  // 2. Fetch today's fill rate
  const { data: fillRateRows } = await supabase
    .from('fill_rate_daily')
    .select('*')
    .eq('biz_date', date);

  const todayFillRate = fillRateRows?.[0] || null;

  // 3. Fetch 7-day average fill rate
  const { data: recentFillRates } = await supabase
    .from('fill_rate_daily')
    .select('fill_rate')
    .lte('biz_date', date)
    .order('biz_date', { ascending: false })
    .limit(7);

  let avg7DayFillRate: number | null = null;
  if (recentFillRates && recentFillRates.length > 0) {
    const valid = recentFillRates.map(r => Number(r.fill_rate)).filter(n => !isNaN(n));
    if (valid.length > 0) {
      avg7DayFillRate = valid.reduce((a, b) => a + b, 0) / valid.length;
    }
  }

  // 4. Fetch today's profit from profit_daily
  const { data: profitRows } = await supabase
    .from('profit_daily')
    .select('*')
    .eq('biz_date', date);

  const todayProfit = profitRows?.[0] || null;

  // 5. Fetch today's cash flow from cash_daily
  const { data: cashRows } = await supabase
    .from('cash_daily')
    .select('*')
    .eq('biz_date', date);

  const todayCash = cashRows?.[0] || null;

  // 6. Fetch operational kg totals for today
  // - Bought: sum of qty from purchases
  const { data: purchases } = await supabase
    .from('purchases')
    .select('qty, products ( unit, avg_weight_kg )')
    .eq('biz_date', date)
    .is('voided_at', null);

  let totalBoughtKg = 0;
  for (const p of purchases || []) {
    const q = Number(p.qty) || 0;
    const prod = (p.products as unknown) as { unit: string; avg_weight_kg: number | null } | null;
    if (prod?.unit === 'pcs') {
      totalBoughtKg += q * (prod.avg_weight_kg || 1);
    } else {
      totalBoughtKg += q;
    }
  }

  // - Ordered: sum of packs_ordered * base_qty_per_pack
  const { data: orderLines } = await supabase
    .from('orders')
    .select(`
      delivery_date,
      order_lines ( packs_ordered, skus ( base_qty_per_pack, products ( unit, avg_weight_kg ) ) )
    `)
    .eq('delivery_date', date)
    .is('voided_at', null);

  let totalOrderedKg = 0;
  let totalOrderedPacks = 0;
  for (const o of orderLines || []) {
    const lines = ((o.order_lines as unknown) as Array<{
      packs_ordered: number;
      skus: { base_qty_per_pack: number; products: { unit: string; avg_weight_kg: number | null } | null } | null;
    }>) || [];
    for (const l of lines) {
      const packs = Number(l.packs_ordered) || 0;
      totalOrderedPacks += packs;
      const baseQty = Number(l.skus?.base_qty_per_pack) || 0;
      if (l.skus?.products?.unit === 'pcs') {
        totalOrderedKg += packs * baseQty * (l.skus.products.avg_weight_kg || 1);
      } else {
        totalOrderedKg += packs * baseQty;
      }
    }
  }

  // - Packed: sum of packs_made from pack_runs
  const { data: packRuns } = await supabase
    .from('pack_runs')
    .select(`
      packs_made,
      skus ( base_qty_per_pack, products ( unit, avg_weight_kg ) )
    `)
    .eq('biz_date', date)
    .is('voided_at', null);

  let totalPackedKg = 0;
  let totalPackedPacks = 0;
  for (const pr of packRuns || []) {
    const packs = Number(pr.packs_made) || 0;
    totalPackedPacks += packs;
    const skuObj = (pr.skus as unknown) as { base_qty_per_pack: number; products: { unit: string; avg_weight_kg: number | null } | null } | null;
    const baseQty = Number(skuObj?.base_qty_per_pack) || 0;
    if (skuObj?.products?.unit === 'pcs') {
      totalPackedKg += packs * baseQty * (skuObj.products.avg_weight_kg || 1);
    } else {
      totalPackedKg += packs * baseQty;
    }
  }

  // - Delivered/Accepted: from delivery_notes
  const { data: delNotes } = await supabase
    .from('delivery_notes')
    .select(`
      delivery_date,
      delivery_note_lines ( accepted_qty, skus ( base_qty_per_pack, products ( unit, avg_weight_kg ) ) )
    `)
    .eq('delivery_date', date)
    .eq('status', 'confirmed')
    .is('voided_at', null);

  let totalAcceptedPacks = 0;
  let totalAcceptedKg = 0;
  for (const dn of delNotes || []) {
    const lines = ((dn.delivery_note_lines as unknown) as Array<{
      accepted_qty: number;
      skus: { base_qty_per_pack: number; products: { unit: string; avg_weight_kg: number | null } | null } | null;
    }>) || [];
    for (const l of lines) {
      const packs = Number(l.accepted_qty) || 0;
      totalAcceptedPacks += packs;
      const baseQty = Number(l.skus?.base_qty_per_pack) || 0;
      if (l.skus?.products?.unit === 'pcs') {
        totalAcceptedKg += packs * baseQty * (l.skus.products.avg_weight_kg || 1);
      } else {
        totalAcceptedKg += packs * baseQty;
      }
    }
  }

  // 7. Check items needing review (inbox_items)
  const { data: inboxReview } = await supabase
    .from('inbox_items')
    .select('id, channel, raw_text, created_at, status')
    .eq('status', 'needs_review')
    .order('created_at', { ascending: false });

  // 8. Check negative stock alerts
  const { data: negativeStock } = await supabase
    .from('negative_stock_alerts')
    .select('product_id, lot_id, qty, products ( name_en, name_hi, unit )');

  // 9. Check buying plan approval status for today
  const { data: buyingPlan } = await supabase
    .from('buying_plans')
    .select('id, plan_date, approved_by, approved_at')
    .eq('plan_date', date)
    .maybeSingle();

  return NextResponse.json({
    date,
    missing_kg_estimate: missingKgEstimate,
    month_estimate_kg: kgEst?.kg || null,
    fill_rate: {
      today: todayFillRate
        ? {
            ordered_packs: Number(todayFillRate.ordered_packs),
            accepted_packs: Number(todayFillRate.accepted_packs),
            rate: Number(todayFillRate.fill_rate),
          }
        : null,
      avg_7_day: avg7DayFillRate,
    },
    profit: todayProfit
      ? {
          revenue_flipkart_paise: Number(todayProfit.revenue_flipkart_paise),
          revenue_local_paise: Number(todayProfit.revenue_local_paise),
          cogs_flipkart_paise: Number(todayProfit.cogs_flipkart_paise),
          cogs_local_paise: Number(todayProfit.cogs_local_paise),
          losses_paise: Number(todayProfit.losses_paise),
          giveaway_paise: Number(todayProfit.giveaway_paise),
          variable_costs_paise: Number(todayProfit.variable_costs_allocated_paise),
          fixed_costs_paise: Number(todayProfit.fixed_costs_paise),
          flipkart_deductions_paise: Number(todayProfit.flipkart_deductions_paise),
          net_profit_paise: Number(todayProfit.profit_paise),
        }
      : null,
    cash: todayCash
      ? {
          cash_in_paise: Number(todayCash.cash_in_paise),
          cash_out_paise: Number(todayCash.cash_out_paise),
          net_cash_paise: Number(todayCash.cash_in_paise) - Number(todayCash.cash_out_paise),
        }
      : null,
    operations: {
      ordered_kg: Math.round(totalOrderedKg * 10) / 10,
      ordered_packs: totalOrderedPacks,
      bought_kg: Math.round(totalBoughtKg * 10) / 10,
      packed_kg: Math.round(totalPackedKg * 10) / 10,
      packed_packs: totalPackedPacks,
      accepted_kg: Math.round(totalAcceptedKg * 10) / 10,
      accepted_packs: totalAcceptedPacks,
    },
    review_count: (inboxReview || []).length,
    inbox_items: inboxReview || [],
    negative_stock_alerts: negativeStock || [],
    buying_plan_approved: !!buyingPlan?.approved_at,
  });
}
