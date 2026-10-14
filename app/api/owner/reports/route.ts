import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * GET /api/owner/reports?report=<report_name>&date=<YYYY-MM-DD>&month=<YYYY-MM>
 * Reads reports directly from Postgres views (never calculates in application code).
 */
export async function GET(request: NextRequest) {
  const report = request.nextUrl.searchParams.get('report');
  const date = request.nextUrl.searchParams.get('date');
  const month = request.nextUrl.searchParams.get('month');

  if (!report) {
    return NextResponse.json({ error: 'report parameter is required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  switch (report) {
    case 'fill_rate': {
      let query = supabase.from('fill_rate_daily').select('*').order('biz_date', { ascending: false });
      if (date) query = query.eq('biz_date', date);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    case 'shortfall': {
      let query = supabase
        .from('shortfall_by_reason')
        .select(`
          biz_date, sku_id, reason, short_packs,
          skus ( label, base_qty_per_pack, products ( name_en, name_hi, unit ) )
        `)
        .order('biz_date', { ascending: false });
      if (date) query = query.eq('biz_date', date);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    case 'profit_daily': {
      let query = supabase.from('profit_daily').select('*').order('biz_date', { ascending: false });
      if (date) query = query.eq('biz_date', date);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    case 'profit_product': {
      let query = supabase
        .from('profit_daily_product')
        .select(`
          *,
          products ( name_en, name_hi, unit )
        `)
        .order('biz_date', { ascending: false });
      if (date) query = query.eq('biz_date', date);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    case 'profit_monthly': {
      let query = supabase.from('profit_monthly').select('*').order('month', { ascending: false });
      if (month) query = query.eq('month', `${month}-01`);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    case 'losses': {
      let query = supabase
        .from('losses_valued')
        .select(`
          biz_date, product_id, reason, qty_lost, value_paise,
          products ( name_en, name_hi, unit )
        `)
        .order('biz_date', { ascending: false });
      if (date) query = query.eq('biz_date', date);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    case 'giveaway': {
      let query = supabase
        .from('giveaway_daily')
        .select(`
          biz_date, product_id, qty, value_paise,
          products ( name_en, name_hi, unit )
        `)
        .order('biz_date', { ascending: false });
      if (date) query = query.eq('biz_date', date);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    case 'stock_book': {
      let query = supabase
        .from('stock_book_daily')
        .select(`
          *,
          products ( name_en, name_hi, unit )
        `)
        .order('biz_date', { ascending: false });
      if (date) query = query.eq('biz_date', date);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    case 'cash': {
      let query = supabase.from('cash_daily').select('*').order('biz_date', { ascending: false });
      if (date) query = query.eq('biz_date', date);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    case 'flipkart_receivable': {
      const { data, error } = await supabase.from('flipkart_receivable').select('*');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data?.[0] || null });
    }

    case 'packs_outstanding': {
      let query = supabase
        .from('packs_outstanding_daily')
        .select(`
          biz_date, sku_id, packs_made, packs_accepted, packs_returned, packs_outstanding,
          skus ( label, base_qty_per_pack, products ( name_en, name_hi, unit ) )
        `)
        .order('biz_date', { ascending: false });
      if (date) query = query.eq('biz_date', date);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    case 'mandi_comparison': {
      let query = supabase.from('mandi_rate_comparison').select('*').order('biz_date', { ascending: false });
      if (date) query = query.eq('biz_date', date);
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    case 'negative_stock': {
      const { data, error } = await supabase
        .from('negative_stock_alerts')
        .select(`
          product_id, lot_id, qty,
          products ( name_en, name_hi, unit )
        `);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report, data: data || [] });
    }

    default:
      return NextResponse.json({ error: `Unknown report: "${report}"` }, { status: 400 });
  }
}
