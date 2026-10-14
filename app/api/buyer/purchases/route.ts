import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * GET /api/buyer/purchases?date=YYYY-MM-DD&product_id=uuid
 * Returns today's purchases for a product, with lot costs.
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  const productId = request.nextUrl.searchParams.get('product_id');

  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  let query = supabase
    .from('purchases')
    .select(`
      id, product_id, lot_id, qty, rate_paise, biz_date,
      mandi_id, note, entered_at, voided_at,
      mandis ( name )
    `)
    .eq('biz_date', date)
    .is('voided_at', null)
    .order('entered_at', { ascending: false });

  if (productId) {
    query = query.eq('product_id', productId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
