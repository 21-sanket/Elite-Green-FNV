import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * GET /api/supervisor/packing?date=YYYY-MM-DD
 * Returns SKUs to pack for the day:
 * - packs ordered from Flipkart orders
 * - packs already made from pack_runs
 * - available fresh lot for allocation
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // 1. Fetch SKUs with product info
  const { data: skus, error: skuErr } = await supabase
    .from('skus')
    .select(`
      id, product_id, label, base_qty_per_pack, active,
      products ( id, name_en, name_hi, unit, max_fresh_days )
    `)
    .eq('active', true);

  if (skuErr) {
    return NextResponse.json({ error: skuErr.message }, { status: 500 });
  }

  // 2. Fetch today's orders & order lines
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, delivery_date,
      order_lines ( id, sku_id, packs_ordered )
    `)
    .eq('delivery_date', date)
    .is('voided_at', null);

  const packsOrderedBySku: Record<string, number> = {};
  for (const o of orders || []) {
    const lines = (o.order_lines as Array<{ sku_id: string; packs_ordered: number }>) || [];
    for (const l of lines) {
      packsOrderedBySku[l.sku_id] = (packsOrderedBySku[l.sku_id] || 0) + Number(l.packs_ordered);
    }
  }

  // 3. Fetch today's pack runs
  const { data: packRuns } = await supabase
    .from('pack_runs')
    .select(`
      id, sku_id, packs_made, biz_date,
      pack_run_lots ( lot_id, qty_packed, qty_graded_out )
    `)
    .eq('biz_date', date)
    .is('voided_at', null);

  const packsMadeBySku: Record<string, number> = {};
  const qtyPackedBySku: Record<string, number> = {};
  const qtyGradedBySku: Record<string, number> = {};

  for (const pr of packRuns || []) {
    packsMadeBySku[pr.sku_id] = (packsMadeBySku[pr.sku_id] || 0) + Number(pr.packs_made);
    const lots = (pr.pack_run_lots as Array<{ qty_packed: number; qty_graded_out: number }>) || [];
    for (const pl of lots) {
      qtyPackedBySku[pr.sku_id] = (qtyPackedBySku[pr.sku_id] || 0) + Number(pl.qty_packed);
      qtyGradedBySku[pr.sku_id] = (qtyGradedBySku[pr.sku_id] || 0) + Number(pl.qty_graded_out);
    }
  }

  // 4. Fetch available purchase lots for products
  const { data: lots } = await supabase
    .from('lots')
    .select('id, product_id, lot_date, kind')
    .eq('kind', 'purchase')
    .lte('lot_date', date)
    .order('lot_date', { ascending: false });

  const latestLotByProduct: Record<string, string> = {};
  for (const l of lots || []) {
    if (!latestLotByProduct[l.product_id]) {
      latestLotByProduct[l.product_id] = l.id;
    }
  }

  // 5. Combine into SKU packing cards
  const packingItems = (skus || []).map((sku) => {
    const ordered = packsOrderedBySku[sku.id] || 0;
    const made = packsMadeBySku[sku.id] || 0;
    const remaining = Math.max(0, ordered - made);
    const packedKg = qtyPackedBySku[sku.id] || 0;
    const gradedKg = qtyGradedBySku[sku.id] || 0;
    const baseKgPerPack = Number(sku.base_qty_per_pack);

    // Expected weight vs packed weight (Giveaway calculation)
    const expectedKg = made * baseKgPerPack;
    const giveawayKg = packedKg > expectedKg ? packedKg - expectedKg : 0;

    return {
      sku_id: sku.id,
      product_id: sku.product_id,
      sku_label: sku.label,
      base_qty_per_pack: baseKgPerPack,
      product: sku.products,
      lot_id: latestLotByProduct[sku.product_id] || null,
      packs_ordered: ordered,
      packs_made: made,
      packs_remaining: remaining,
      total_packed_kg: packedKg,
      total_graded_kg: gradedKg,
      giveaway_kg: Number(giveawayKg.toFixed(2)),
      fill_rate_pct: ordered > 0 ? Math.min(100, Math.round((made / ordered) * 100)) : 100,
    };
  });

  return NextResponse.json(packingItems);
}
