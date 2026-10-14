import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * GET /api/supervisor/count?date=YYYY-MM-DD
 * Calls the count_defaults() SQL function to get pre-filled expected lot stock.
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // 1. Call SQL function count_defaults(p_count_date)
  const { data: defaults, error } = await supabase.rpc('count_defaults', {
    p_count_date: date,
  });

  if (error) {
    console.error('count_defaults error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. Fetch products to attach bilingual names & unit
  const { data: products } = await supabase
    .from('products')
    .select('id, name_en, name_hi, unit');

  const productMap = new Map((products || []).map((p) => [p.id, p]));

  // 3. Attach product details
  const enriched = (defaults || []).map((row: {
    product_id: string;
    lot_id: string;
    lot_date: string;
    expected_qty: number;
    default_fresh: number;
    default_local_only: number;
  }) => {
    const prod = productMap.get(row.product_id);
    return {
      ...row,
      expected_qty: Number(row.expected_qty),
      default_fresh: Number(row.default_fresh),
      default_local_only: Number(row.default_local_only),
      product_name_en: prod?.name_en || 'Product',
      product_name_hi: prod?.name_hi || null,
      unit: prod?.unit || 'kg',
    };
  });

  return NextResponse.json(enriched);
}
