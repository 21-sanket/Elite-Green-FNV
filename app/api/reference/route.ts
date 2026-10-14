import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/src/lib/supabase/server';

/**
 * GET /api/reference?tables=products,skus,mandis
 * Returns reference data tables for use in forms.
 */
export async function GET(request: NextRequest) {
  const tablesParam = request.nextUrl.searchParams.get('tables') || 'products,skus,mandis';
  const tables = tablesParam.split(',').map(t => t.trim());

  const supabase = await createServerSupabase();
  const result: Record<string, unknown[]> = {};

  for (const table of tables) {
    switch (table) {
      case 'products': {
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('active', true)
          .order('name_en');
        result.products = data || [];
        break;
      }
      case 'skus': {
        const { data } = await supabase
          .from('skus')
          .select('*')
          .eq('active', true)
          .order('label');
        result.skus = data || [];
        break;
      }
      case 'mandis': {
        const { data } = await supabase
          .from('mandis')
          .select('*')
          .order('name');
        result.mandis = data || [];
        break;
      }
      case 'cost_types': {
        const { data } = await supabase
          .from('cost_types')
          .select('*')
          .order('name');
        result.cost_types = data || [];
        break;
      }
      default:
        break;
    }
  }

  return NextResponse.json(result);
}
