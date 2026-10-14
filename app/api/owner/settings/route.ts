import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/src/lib/supabase/server';

/**
 * GET /api/owner/settings
 * Fetches all reference configuration data.
 *
 * POST /api/owner/settings
 * Updates/inserts configuration rows.
 */
export async function GET() {
  const supabase = await createServiceRoleClient();

  const [
    { data: products },
    { data: skus },
    { data: rates },
    { data: mandis },
    { data: costTypes },
    { data: kgEstimates },
    { data: settings },
  ] = await Promise.all([
    supabase.from('products').select('*').order('name_en'),
    supabase.from('skus').select('*, products(name_en, name_hi, unit)').order('label'),
    supabase.from('flipkart_rates').select('*, skus(label, products(name_en))').order('valid_from', { ascending: false }),
    supabase.from('mandis').select('*').order('name'),
    supabase.from('cost_types').select('*').order('name'),
    supabase.from('kg_estimates').select('*').order('month', { ascending: false }),
    supabase.from('settings').select('*'),
  ]);

  return NextResponse.json({
    products: products || [],
    skus: skus || [],
    flipkart_rates: rates || [],
    mandis: mandis || [],
    cost_types: costTypes || [],
    kg_estimates: kgEstimates || [],
    settings: settings || [],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const supabase = await createServiceRoleClient();

    if (action === 'save_kg_estimate') {
      const { month, kg } = body;
      if (!month || !kg || kg <= 0) {
        return NextResponse.json({ error: 'month (YYYY-MM-01) and kg > 0 are required' }, { status: 400 });
      }
      const formattedMonth = month.length === 7 ? `${month}-01` : month;

      const { data, error } = await supabase
        .from('kg_estimates')
        .upsert({ month: formattedMonth, kg: Number(kg) })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'add_flipkart_rate') {
      const { sku_id, rate_paise, valid_from, valid_to } = body;
      if (!sku_id || !rate_paise || rate_paise <= 0 || !valid_from) {
        return NextResponse.json({ error: 'sku_id, rate_paise > 0, and valid_from are required' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('flipkart_rates')
        .insert({
          sku_id,
          rate_paise: Number(rate_paise),
          valid_from,
          valid_to: valid_to || null,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'save_product') {
      const { name_en, name_hi, unit, avg_weight_kg, max_fresh_days = 2, extra_pct_override } = body;
      if (!name_en || !unit) {
        return NextResponse.json({ error: 'name_en and unit are required' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('products')
        .insert({
          name_en,
          name_hi: name_hi || null,
          unit,
          avg_weight_kg: avg_weight_kg ? Number(avg_weight_kg) : null,
          max_fresh_days: Number(max_fresh_days),
          extra_pct_override: extra_pct_override !== undefined && extra_pct_override !== '' ? Number(extra_pct_override) : null,
          active: true,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'save_sku') {
      const { product_id, label, base_qty_per_pack } = body;
      if (!product_id || !label || !base_qty_per_pack || base_qty_per_pack <= 0) {
        return NextResponse.json({ error: 'product_id, label, and base_qty_per_pack > 0 are required' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('skus')
        .insert({
          product_id,
          label,
          base_qty_per_pack: Number(base_qty_per_pack),
          active: true,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'save_mandi') {
      const { name } = body;
      if (!name || !name.trim()) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('mandis')
        .insert({ name: name.trim() })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'save_cost_type') {
      const { name, kind } = body;
      if (!name || !kind || (kind !== 'fixed' && kind !== 'variable')) {
        return NextResponse.json({ error: 'name and kind (fixed | variable) are required' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('cost_types')
        .insert({ name: name.trim(), kind })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
