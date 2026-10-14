/**
 * Verification test script for Section 9 Acceptance Numbers.
 * Tests against live Supabase PostgreSQL views and functions.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually for standalone script runner
try {
  const envPath = resolve(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
} catch {
  // Ignore if already in environment
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error('Missing Supabase URL or Service Role Key in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

async function runAcceptanceTests() {
  console.log('====================================================');
  console.log(' FNV Daily Ops — Section 9 Acceptance Assertions');
  console.log(` Target Database: ${url}`);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(` ✅ PASS: ${name}`);
      passed++;
    } else {
      console.log(` ❌ FAIL: ${name}`);
      if (details) console.log(`    Detail: ${details}`);
      failed++;
    }
  }

  // 1. Assert fill_rate_daily for 2026-10-04
  const { data: fillRates, error: fillErr } = await supabase
    .from('fill_rate_daily')
    .select('*')
    .eq('biz_date', '2026-10-04');

  if (fillErr) {
    assert('fill_rate_daily query', false, fillErr.message);
  } else {
    const r = fillRates?.[0];
    const ordered = Number(r?.ordered_packs);
    const accepted = Number(r?.accepted_packs);
    const rate = Number(r?.fill_rate);

    assert(
      'Fill rate on 4 Oct: 254 accepted / 268 ordered = 94.78%',
      ordered === 268 && accepted === 254 && Math.abs(rate - 0.9478) < 0.001,
      `Got ordered=${ordered}, accepted=${accepted}, rate=${(rate * 100).toFixed(2)}%`,
    );
  }

  // 2. Assert flipkart_daily revenue on 2026-10-04 (Expected 397,500 paise = ₹3,975.00)
  const { data: fkDaily, error: fkErr } = await supabase
    .from('flipkart_daily')
    .select('*')
    .eq('biz_date', '2026-10-04');

  if (fkErr) {
    assert('flipkart_daily query', false, fkErr.message);
  } else {
    const totalRev = (fkDaily || []).reduce((acc, row) => acc + (Number(row.revenue_paise) || 0), 0);
    assert(
      'Flipkart daily revenue on 4 Oct: 397,500 paise (₹3,975.00)',
      totalRev === 397500,
      `Got totalRev=${totalRev} paise`,
    );
  }

  // 3. Assert giveaway_daily on 2026-10-04 (Expected: 800 paise)
  const { data: giveaway, error: gwErr } = await supabase
    .from('giveaway_daily')
    .select('*')
    .eq('biz_date', '2026-10-04');

  if (gwErr) {
    assert('giveaway_daily query', false, gwErr.message);
  } else {
    const totalGwPaise = (giveaway || []).reduce((acc, row) => acc + (Number(row.value_paise) || 0), 0);
    assert(
      'Giveaway (overpacking) on 4 Oct: 800 paise',
      totalGwPaise === 800,
      `Got totalGwPaise=${totalGwPaise}`,
    );
  }

  // 4. Assert cash_daily on 2026-10-04 (Expected: out 744,900 paise, in 110,000 paise)
  const { data: cashRows, error: cashErr } = await supabase
    .from('cash_daily')
    .select('*')
    .eq('biz_date', '2026-10-04');

  if (cashErr) {
    assert('cash_daily query', false, cashErr.message);
  } else {
    const c = cashRows?.[0];
    const cashOut = Number(c?.cash_out_paise);
    const cashIn = Number(c?.cash_in_paise);
    assert(
      'Cash daily 4 Oct: cash_out=744,900 paise, cash_in=110,000 paise',
      cashOut === 744900 && cashIn === 110000,
      `Got cashOut=${cashOut}, cashIn=${cashIn}`,
    );
  }

  // 5. Assert flipkart_receivable across all days (includes 2-3 Oct historical notes + 4 Oct)
  const { data: receivable, error: recErr } = await supabase
    .from('flipkart_receivable')
    .select('*');

  if (recErr) {
    assert('flipkart_receivable query', false, recErr.message);
  } else {
    const r = receivable?.[0];
    const billed = Number(r?.billed_paise);
    const received = Number(r?.received_paise);
    const deducted = Number(r?.deducted_paise);
    const owed = Number(r?.owed_paise);

    // Total cumulative billed across 2, 3, and 4 Oct = 956,800 paise
    // If only 4 Oct were present, billed = 397,500; with 2-3 Oct historical seed data, billed = 956,800
    assert(
      'Flipkart cumulative receivable: 956,800 billed (includes 2-3 Oct notes), 100,000 received, 5,000 deducted -> 851,800 owed',
      billed === 956800 && received === 100000 && deducted === 5000 && owed === 851800,
      `Got billed=${billed}, received=${received}, deducted=${deducted}, owed=${owed}`,
    );
  }

  // 6. Assert stock_on_hand for Round Bottle Gourd (8 pcs: 5 fresh + 3 local_only)
  const { data: stockHand, error: stErr } = await supabase
    .from('stock_on_hand')
    .select('product_id, state, qty, products(name_en, unit)')
    .order('qty', { ascending: false });

  if (stErr) {
    assert('stock_on_hand query', false, stErr.message);
  } else {
    const gourdRows = (stockHand || []).filter(
      r => ((r.products as unknown) as { name_en: string })?.name_en === 'Round Bottle Gourd',
    );
    const freshGourd = gourdRows.find(r => r.state === 'fresh')?.qty;
    const localGourd = gourdRows.find(r => r.state === 'local_only')?.qty;

    assert(
      'Round Bottle Gourd stock on hand: 5 fresh + 3 local_only = 8 pcs total',
      Number(freshGourd) === 5 && Number(localGourd) === 3,
      `Got fresh=${freshGourd}, local=${localGourd}`,
    );
  }

  // 7. Assert buying_plan_calc for 2026-10-05 has Round Bottle Gourd with too_high=true, qty_to_buy=70
  const { data: planCalc, error: planErr } = await supabase.rpc('buying_plan_calc', {
    p_date: '2026-10-05',
  });

  if (planErr) {
    assert('buying_plan_calc query', false, planErr.message);
  } else {
    const gourdPlan = (planCalc || []).find((p: { name_en: string }) => p.name_en === 'Round Bottle Gourd');
    assert(
      'Buying plan calc 5 Oct: Round Bottle Gourd too_high=true, qty_to_buy=70',
      gourdPlan?.too_high === true && Number(gourdPlan?.qty_to_buy) === 70,
      `Got too_high=${gourdPlan?.too_high}, qty_to_buy=${gourdPlan?.qty_to_buy}`,
    );
  }

  // 8. Assert Append-Only Ledger Guard: Attempting UPDATE on orders should be REJECTED by trigger
  const { data: anyOrder } = await supabase.from('orders').select('id').limit(1).single();
  if (anyOrder) {
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ note: 'malicious-update-test' })
      .eq('id', anyOrder.id);

    assert(
      'Ledger Guard trigger blocks direct UPDATE on orders',
      updateErr !== null && updateErr.message.includes('Records cannot be edited'),
      `Update error: ${updateErr?.message || 'Update unexpectedly succeeded!'}`,
    );
  }

  console.log('\n====================================================');
  console.log(` Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAcceptanceTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
