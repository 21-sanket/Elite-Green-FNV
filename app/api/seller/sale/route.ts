import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * POST /api/seller/sale
 * Records a local market sale.
 * Allocates from `local_only` lots first, then `fresh` surplus.
 *
 * Body: {
 *   product_id: string;
 *   qty: number;
 *   rate_paise: number;
 *   pay_mode: 'cash' | 'credit';
 *   biz_date: string;
 *   note?: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, qty, rate_paise, pay_mode = 'cash', biz_date, note } = body;

    if (!product_id || !qty || qty <= 0 || rate_paise === undefined || rate_paise < 0 || !biz_date) {
      return NextResponse.json(
        { error: 'product_id, qty > 0, rate_paise >= 0, and biz_date are required' },
        { status: 400 },
      );
    }

    const supabase = await createServiceRoleClient();

    // 1. Get seller user ID
    const { data: sellers } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'seller')
      .eq('active', true)
      .limit(1);

    let enteredBy = sellers?.[0]?.id;
    if (!enteredBy) {
      const { data: anyUser } = await supabase
        .from('users')
        .select('id')
        .eq('active', true)
        .limit(1);
      enteredBy = anyUser?.[0]?.id;
    }

    if (!enteredBy) {
      return NextResponse.json(
        { error: 'No active user found in system to record sale' },
        { status: 500 },
      );
    }

    // 2. Fetch available lots from stock_on_hand for this product
    const { data: lotsOnHand, error: stockErr } = await supabase
      .from('stock_on_hand')
      .select('lot_id, lot_date, state, qty')
      .eq('product_id', product_id)
      .gt('qty', 0);

    if (stockErr) {
      return NextResponse.json({ error: stockErr.message }, { status: 500 });
    }

    // Sort: local_only first (ascending lot_date), then fresh (ascending lot_date)
    const sortedLots = (lotsOnHand || []).sort((a, b) => {
      if (a.state === 'local_only' && b.state !== 'local_only') return -1;
      if (a.state !== 'local_only' && b.state === 'local_only') return 1;
      return a.lot_date.localeCompare(b.lot_date);
    });

    let remainingNeeded = Number(qty);
    const saleEntries: Array<{
      product_id: string;
      lot_id: string;
      from_state: 'local_only' | 'fresh';
      qty: number;
      rate_paise: number;
      pay_mode: 'cash' | 'credit';
      biz_date: string;
      entered_by: string;
      channel: 'form';
      note: string | null;
    }> = [];

    for (const lot of sortedLots) {
      if (remainingNeeded <= 0.0001) break;
      const lotQty = Number(lot.qty);
      const take = Math.min(remainingNeeded, lotQty);
      if (take > 0.0001) {
        saleEntries.push({
          product_id,
          lot_id: lot.lot_id,
          from_state: lot.state as 'local_only' | 'fresh',
          qty: Math.round(take * 1000) / 1000,
          rate_paise,
          pay_mode,
          biz_date,
          entered_by: enteredBy,
          channel: 'form',
          note: note || null,
        });
        remainingNeeded -= take;
      }
    }

    // 3. Fallback if stock on hand didn't cover the entire sold qty
    if (remainingNeeded > 0.0001) {
      // Find the latest purchase lot for this product
      const { data: latestLots } = await supabase
        .from('lots')
        .select('id')
        .eq('product_id', product_id)
        .order('lot_date', { ascending: false })
        .limit(1);

      let fallbackLotId = latestLots?.[0]?.id;
      if (!fallbackLotId) {
        // Create or get purchase lot via RPC or direct insert
        const { data: newLot } = await supabase
          .from('lots')
          .insert({
            product_id,
            lot_date: biz_date,
            kind: 'purchase',
          })
          .select('id')
          .single();
        fallbackLotId = newLot?.id;
      }

      if (fallbackLotId) {
        saleEntries.push({
          product_id,
          lot_id: fallbackLotId,
          from_state: 'local_only',
          qty: Math.round(remainingNeeded * 1000) / 1000,
          rate_paise,
          pay_mode,
          biz_date,
          entered_by: enteredBy,
          channel: 'form',
          note: note ? `${note} (untracked stock)` : 'untracked stock',
        });
      }
    }

    // 4. Insert all local_sales rows
    const { data: inserted, error: insertErr } = await supabase
      .from('local_sales')
      .insert(saleEntries)
      .select('id, product_id, lot_id, from_state, qty, rate_paise, amount_paise, pay_mode, biz_date');

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sales: inserted,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
