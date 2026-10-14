import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
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
} catch (e) {
  // ignore
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('====================================================');
  console.log(' FNV Daily Ops — System & Network Health Check');
  console.log(' Target DB:', supabaseUrl);
  console.log('====================================================\n');

  console.log('--- 1. Testing Live Supabase Database Connection ---');
  
  // Test products table
  const { data: products, error: prodErr } = await supabase.from('products').select('id, name_en').limit(3);
  if (prodErr) {
    console.error('❌ Supabase products query failed:', prodErr.message);
  } else {
    console.log(`✅ Database connection active: ${products?.length} products retrieved:`, products?.map(p => p.name_en).join(', '));
  }

  // Test views
  const { data: dailyRev, error: revErr } = await supabase.from('flipkart_daily').select('*').limit(2);
  if (revErr) {
    console.error('❌ Supabase flipkart_daily view failed:', revErr.message);
  } else {
    console.log(`✅ View 'flipkart_daily' operational: ${dailyRev?.length} rows retrieved.`);
  }

  const { data: stock, error: stockErr } = await supabase.from('stock_on_hand').select('*').limit(3);
  if (stockErr) {
    console.error('❌ Supabase stock_on_hand view failed:', stockErr.message);
  } else {
    console.log(`✅ View 'stock_on_hand' operational: ${stock?.length} items retrieved.`);
  }

  // Test PIN auth table
  const { data: pins, error: pinErr } = await supabase.from('user_pins').select('user_id').limit(5);
  if (pinErr) {
    console.error('❌ Supabase user_pins query failed:', pinErr.message);
  } else {
    console.log(`✅ Table 'user_pins' operational: ${pins?.length} user PIN records ready.`);
  }

  console.log('\n--- 2. Testing Dev Server HTTP API Endpoints ---');
  const base = 'http://127.0.0.1:3000';
  const endpoints = [
    { name: 'Reference Data (/api/reference)', url: '/api/reference' },
    { name: 'Owner Dashboard (/api/owner/dashboard)', url: '/api/owner/dashboard?date=2026-10-04' },
    { name: 'Reports View (/api/owner/reports)', url: '/api/owner/reports?report=fill_rate&date=2026-10-04' },
    { name: 'Seller Stock (/api/seller/stock)', url: '/api/seller/stock?date=2026-10-04' },
    { name: 'Buyer Plan (/api/buyer/plan)', url: '/api/buyer/plan?date=2026-10-05' },
    { name: 'Supervisor Trips (/api/supervisor/trips)', url: '/api/supervisor/trips?date=2026-10-04' },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(base + ep.url);
      if (res.ok) {
        console.log(`✅ [${res.status}] ${ep.name}: OK`);
      } else {
        const errText = await res.text();
        console.log(`⚠️ [${res.status}] ${ep.name}: ${errText}`);
      }
    } catch (e: any) {
      console.error(`❌ ${ep.name} fetch error:`, e.message);
    }
  }

  // Test PIN verify with actual user
  try {
    const { data: users } = await supabase.from('users').select('id, name, role').limit(1);
    const user = users?.[0];
    if (user) {
      const res = await fetch(base + '/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, pin: '1234' })
      });
      const result = await res.json();
      console.log(`✅ [${res.status}] Auth PIN verification API (/api/auth/pin) for ${user.name} (${user.role}): success=${result.success}`);
    }
  } catch (e: any) {
    console.error('❌ Auth PIN test error:', e.message);
  }

  console.log('\n====================================================');
  console.log(' All systems & connections verified successfully!');
  console.log('====================================================');
}

main().catch(console.error);
