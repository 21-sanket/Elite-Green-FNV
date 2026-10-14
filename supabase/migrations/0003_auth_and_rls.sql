-- Migration 0003: Auth support tables and Row-Level Security policies
-- Login: personal magic link + 4-digit PIN. No email needed.
-- RLS enforces the permission matrix from section 4 at the database level.

-- ---------------------------------------------------------------- auth tables
create table user_pins (
  user_id uuid primary key references users(id),
  pin_hash text not null,
  magic_token uuid not null unique default gen_random_uuid()
);

-- Map Supabase auth.users to our users table
create table auth_user_map (
  auth_id uuid primary key references auth.users(id),
  user_id uuid not null unique references users(id)
);

-- Helper: get the app user_id for the current session
create function current_app_user_id() returns uuid
language sql stable security definer as $$
  select user_id from auth_user_map where auth_id = auth.uid()
$$;

-- Helper: get the role for the current session
create function current_app_role() returns user_role
language sql stable security definer as $$
  select u.role from users u
  join auth_user_map m on m.user_id = u.id
  where m.auth_id = auth.uid()
$$;

-- ---------------------------------------------------------------- enable RLS on all tables
alter table users enable row level security;
alter table products enable row level security;
alter table skus enable row level security;
alter table flipkart_rates enable row level security;
alter table mandis enable row level security;
alter table cost_types enable row level security;
alter table kg_estimates enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table buying_plans enable row level security;
alter table plan_lines enable row level security;
alter table lots enable row level security;
alter table purchases enable row level security;
alter table trips enable row level security;
alter table trip_lines enable row level security;
alter table trip_receipts enable row level security;
alter table trip_receipt_lines enable row level security;
alter table pack_runs enable row level security;
alter table pack_run_lots enable row level security;
alter table delivery_notes enable row level security;
alter table delivery_note_lines enable row level security;
alter table stock_counts enable row level security;
alter table stock_count_lines enable row level security;
alter table local_sales enable row level security;
alter table costs enable row level security;
alter table payments enable row level security;
alter table deductions enable row level security;
alter table media enable row level security;
alter table audit_log enable row level security;
alter table inbox_items enable row level security;
alter table stock_movements enable row level security;

-- ---------------------------------------------------------------- reference data: everyone reads
create policy "ref_read" on products for select using (true);
create policy "ref_read" on skus for select using (true);
create policy "ref_read" on mandis for select using (true);
create policy "ref_read" on cost_types for select using (true);

-- Owner-only write on reference data
create policy "ref_owner_insert" on products for insert with check (current_app_role() = 'owner');
create policy "ref_owner_insert" on skus for insert with check (current_app_role() = 'owner');
create policy "ref_owner_insert" on mandis for insert with check (current_app_role() = 'owner');
create policy "ref_owner_insert" on cost_types for insert with check (current_app_role() = 'owner');
create policy "ref_owner_insert" on flipkart_rates for insert with check (current_app_role() = 'owner');
create policy "ref_owner_insert" on kg_estimates for insert with check (current_app_role() = 'owner');

-- Flipkart rates: owner reads
create policy "rates_read" on flipkart_rates for select using (current_app_role() = 'owner');
create policy "kg_est_read" on kg_estimates for select using (current_app_role() = 'owner');

-- ---------------------------------------------------------------- users: everyone sees own, owner sees all
create policy "users_own" on users for select using (
  id = current_app_user_id() or current_app_role() = 'owner'
);
create policy "users_owner_insert" on users for insert with check (current_app_role() = 'owner');

-- ---------------------------------------------------------------- purchases: buyer inserts, buyer + owner read
create policy "purchases_insert" on purchases for insert with check (current_app_role() = 'buyer');
create policy "purchases_read" on purchases for select using (
  current_app_role() in ('buyer', 'owner')
);
-- buyer can void own? no — only owner can void (handled by ledger_guard + update policy)
create policy "purchases_void" on purchases for update using (current_app_role() = 'owner');

-- ---------------------------------------------------------------- lots: system-created, everyone reads for their scope
create policy "lots_insert" on lots for insert with check (
  current_app_role() in ('buyer', 'supervisor', 'owner')
);
create policy "lots_read" on lots for select using (
  current_app_role() in ('buyer', 'supervisor', 'owner')
);

-- ---------------------------------------------------------------- trips: role-based by leg
create policy "trips_insert" on trips for insert with check (
  (current_app_role() = 'buyer' and leg = 'to_warehouse') or
  (current_app_role() = 'delivery' and leg in ('to_flipkart', 'return')) or
  current_app_role() = 'owner'
);
-- Workaround: RLS cannot reference NEW in select policies, use broader read
create policy "trips_read" on trips for select using (
  current_app_role() in ('buyer', 'supervisor', 'delivery', 'owner')
);
create policy "trips_void" on trips for update using (current_app_role() = 'owner');

create policy "trip_lines_insert" on trip_lines for insert with check (
  current_app_role() in ('buyer', 'delivery', 'owner')
);
create policy "trip_lines_read" on trip_lines for select using (
  current_app_role() in ('buyer', 'supervisor', 'delivery', 'owner')
);

-- ---------------------------------------------------------------- trip receipts: supervisor inserts
create policy "receipts_insert" on trip_receipts for insert with check (
  current_app_role() in ('supervisor', 'owner')
);
create policy "receipts_read" on trip_receipts for select using (
  current_app_role() in ('supervisor', 'owner')
);
create policy "receipts_void" on trip_receipts for update using (current_app_role() = 'owner');

create policy "receipt_lines_insert" on trip_receipt_lines for insert with check (
  current_app_role() in ('supervisor', 'owner')
);
create policy "receipt_lines_read" on trip_receipt_lines for select using (
  current_app_role() in ('supervisor', 'owner')
);

-- ---------------------------------------------------------------- pack runs: supervisor
create policy "pack_runs_insert" on pack_runs for insert with check (
  current_app_role() in ('supervisor', 'owner')
);
create policy "pack_runs_read" on pack_runs for select using (
  current_app_role() in ('supervisor', 'owner')
);
create policy "pack_runs_void" on pack_runs for update using (current_app_role() = 'owner');

create policy "pack_run_lots_insert" on pack_run_lots for insert with check (
  current_app_role() in ('supervisor', 'owner')
);
create policy "pack_run_lots_read" on pack_run_lots for select using (
  current_app_role() in ('supervisor', 'owner')
);

-- ---------------------------------------------------------------- delivery notes: delivery + owner
create policy "dn_insert" on delivery_notes for insert with check (
  current_app_role() in ('delivery', 'owner')
);
create policy "dn_read" on delivery_notes for select using (
  current_app_role() in ('delivery', 'owner')
);
create policy "dn_void" on delivery_notes for update using (current_app_role() = 'owner');

create policy "dnl_insert" on delivery_note_lines for insert with check (
  current_app_role() in ('delivery', 'owner')
);
create policy "dnl_read" on delivery_note_lines for select using (
  current_app_role() in ('delivery', 'owner')
);

-- ---------------------------------------------------------------- stock counts: supervisor
create policy "counts_insert" on stock_counts for insert with check (
  current_app_role() in ('supervisor', 'owner')
);
create policy "counts_read" on stock_counts for select using (
  current_app_role() in ('supervisor', 'owner')
);
create policy "counts_void" on stock_counts for update using (current_app_role() = 'owner');

create policy "count_lines_insert" on stock_count_lines for insert with check (
  current_app_role() in ('supervisor', 'owner')
);
create policy "count_lines_read" on stock_count_lines for select using (
  current_app_role() in ('supervisor', 'owner')
);

-- ---------------------------------------------------------------- local sales: supervisor + seller
create policy "sales_insert" on local_sales for insert with check (
  current_app_role() in ('supervisor', 'seller', 'owner')
);
create policy "sales_read" on local_sales for select using (
  (current_app_role() in ('supervisor', 'seller') and entered_by = current_app_user_id())
  or current_app_role() = 'owner'
);
create policy "sales_void" on local_sales for update using (current_app_role() = 'owner');

-- ---------------------------------------------------------------- orders: owner only
create policy "orders_insert" on orders for insert with check (current_app_role() = 'owner');
create policy "orders_read" on orders for select using (
  current_app_role() in ('buyer', 'supervisor', 'owner')
);
create policy "orders_void" on orders for update using (current_app_role() = 'owner');

create policy "order_lines_insert" on order_lines for insert with check (current_app_role() = 'owner');
create policy "order_lines_read" on order_lines for select using (
  current_app_role() in ('buyer', 'supervisor', 'owner')
);

-- ---------------------------------------------------------------- buying plans: owner creates, buyer reads
create policy "plans_insert" on buying_plans for insert with check (current_app_role() = 'owner');
create policy "plans_read" on buying_plans for select using (
  current_app_role() in ('buyer', 'supervisor', 'owner')
);

create policy "plan_lines_insert" on plan_lines for insert with check (current_app_role() = 'owner');
create policy "plan_lines_read" on plan_lines for select using (
  current_app_role() in ('buyer', 'supervisor', 'owner')
);

-- ---------------------------------------------------------------- costs, payments: owner only
create policy "costs_insert" on costs for insert with check (current_app_role() = 'owner');
create policy "costs_read" on costs for select using (current_app_role() = 'owner');
create policy "costs_void" on costs for update using (current_app_role() = 'owner');

create policy "payments_insert" on payments for insert with check (current_app_role() = 'owner');
create policy "payments_read" on payments for select using (current_app_role() = 'owner');
create policy "payments_void" on payments for update using (current_app_role() = 'owner');

create policy "deductions_insert" on deductions for insert with check (current_app_role() = 'owner');
create policy "deductions_read" on deductions for select using (current_app_role() = 'owner');

-- ---------------------------------------------------------------- media: everyone inserts, owner reads all
create policy "media_insert" on media for insert with check (true);
create policy "media_read" on media for select using (
  taken_by = current_app_user_id() or current_app_role() = 'owner'
);

-- ---------------------------------------------------------------- audit log: owner reads
create policy "audit_read" on audit_log for select using (current_app_role() = 'owner');

-- ---------------------------------------------------------------- inbox: owner reads and updates
create policy "inbox_insert" on inbox_items for insert with check (true);
create policy "inbox_read" on inbox_items for select using (current_app_role() = 'owner');

-- ---------------------------------------------------------------- stock movements: read by supervisor + owner
-- Movements are system-generated by triggers, so insert via security definer functions.
-- Direct insert is not allowed through RLS.
create policy "movements_read" on stock_movements for select using (
  current_app_role() in ('supervisor', 'owner')
);

-- ---------------------------------------------------------------- user_pins: service role only (no RLS policy = deny all)
alter table user_pins enable row level security;
alter table auth_user_map enable row level security;
