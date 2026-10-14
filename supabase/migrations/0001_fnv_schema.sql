-- FNV operations schema, draft 1. Postgres 14 or newer.
-- Rules: records are append-only (void instead of edit), all stock changes go through
-- stock_movements, money is stored in paise, business days use Asia/Kolkata.

create type user_role     as enum ('owner','buyer','supervisor','delivery','seller');
create type unit_kind     as enum ('kg','pcs');
create type trip_leg      as enum ('to_warehouse','to_flipkart','return');
create type stock_state   as enum ('fresh','local_only');
create type move_reason   as enum ('purchase_in','transit_loss','packed','graded_out','return_reject',
                                   'sold_local','written_off','count_adjust','state_change');
create type cost_kind     as enum ('fixed','variable');
create type inbox_status  as enum ('needs_review','confirmed','rejected');
create type pay_mode      as enum ('cash','credit');
create type entry_channel as enum ('form','whatsapp','photo','system');

create function ist_date(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'Asia/Kolkata')::date $$;

-- ---------------------------------------------------------------- reference data
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role user_role not null,
  language char(2) not null default 'hi' check (language in ('hi','en')),
  active boolean not null default true
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name_en text not null unique,
  name_hi text,
  unit unit_kind not null,
  avg_weight_kg numeric(6,3) check (avg_weight_kg > 0),
  max_fresh_days int not null default 2 check (max_fresh_days >= 0),
  extra_pct_override numeric(5,4) check (extra_pct_override >= 0),
  active boolean not null default true,
  check (unit = 'kg' or avg_weight_kg is not null)
);

-- base_qty_per_pack is kg per pack for kg products, pieces per pack for pcs products
create table skus (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  label text not null,
  base_qty_per_pack numeric(8,3) not null check (base_qty_per_pack > 0),
  active boolean not null default true,
  unique (product_id, label)
);

create table flipkart_rates (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references skus(id),
  rate_paise integer not null check (rate_paise > 0),
  valid_from date not null,
  valid_to date,
  check (valid_to is null or valid_to > valid_from)
);

create table mandis (id uuid primary key default gen_random_uuid(), name text not null unique);

create table cost_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind cost_kind not null
);

-- Expected kg handled in a month. Fixed costs are shared by kg handled, and until the month is over
-- the real total is unknown, so early days would carry the whole month. The share per kg uses the
-- larger of this estimate and the kg handled so far.
create table kg_estimates (
  month date primary key check (month = date_trunc('month', month)::date),
  kg numeric not null check (kg > 0)
);

create table media (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'photo',
  storage_path text not null,
  taken_by uuid references users(id),
  taken_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor uuid references users(id),
  action text not null,
  table_name text not null,
  record_id uuid not null,
  detail jsonb
);

-- ---------------------------------------------------------------- ledger headers
-- Every header carries: who, when it happened, when it was entered, business day, channel.
create table orders (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null,
  media_id uuid references media(id),
  event_at timestamptz not null default now(), entered_at timestamptz not null default now(),
  biz_date date not null default ist_date(now()),
  entered_by uuid not null references users(id), channel entry_channel not null default 'form',
  device_id text, note text,
  voided_at timestamptz, voided_by uuid references users(id), void_reason text
);
create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  sku_id uuid not null references skus(id),
  packs_ordered int not null check (packs_ordered > 0)
);

create table buying_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  generated_at timestamptz not null default now(),
  approved_by uuid references users(id), approved_at timestamptz
);
create table plan_lines (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references buying_plans(id),
  product_id uuid not null references products(id),
  order_qty numeric not null, extra_pct numeric not null,
  fresh_stock_qty numeric not null, qty_to_buy numeric not null
);

-- A lot is one product bought on one business day. Return lots hold rejected packs
-- that came back; they carry a fixed unit cost.
create table lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  lot_date date not null,
  kind text not null default 'purchase' check (kind in ('purchase','return')),
  unit_cost_override_paise numeric(14,4),
  created_at timestamptz not null default now()
);
create unique index lots_one_purchase_lot on lots (product_id, lot_date) where kind = 'purchase';

create table purchases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  lot_id uuid not null references lots(id),
  mandi_id uuid references mandis(id),
  qty numeric(10,3) not null check (qty > 0),          -- kg, or pieces for pcs products
  rate_paise numeric(12,2) not null check (rate_paise > 0), -- per kg or per piece
  event_at timestamptz not null default now(), entered_at timestamptz not null default now(),
  biz_date date not null default ist_date(now()),
  entered_by uuid not null references users(id), channel entry_channel not null default 'form',
  device_id text, note text,
  voided_at timestamptz, voided_by uuid references users(id), void_reason text
);

-- Transport: the sender records trip + trip_lines, the receiver records trip_receipts + lines.
create table trips (
  id uuid primary key default gen_random_uuid(),
  leg trip_leg not null,
  driver_name text, vehicle_note text,
  event_at timestamptz not null default now(), entered_at timestamptz not null default now(),
  biz_date date not null default ist_date(now()),
  entered_by uuid not null references users(id), channel entry_channel not null default 'form',
  device_id text, note text,
  voided_at timestamptz, voided_by uuid references users(id), void_reason text
);
create table trip_lines (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  product_id uuid not null references products(id),
  lot_id uuid references lots(id),
  sku_id uuid references skus(id),
  qty_sent numeric(10,3) not null check (qty_sent > 0),
  unit text not null check (unit in ('kg','pcs','packs')),
  check ((unit = 'packs') = (sku_id is not null)),
  check ((unit <> 'packs') = (lot_id is not null))
);
create table trip_receipts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  event_at timestamptz not null default now(), entered_at timestamptz not null default now(),
  biz_date date not null default ist_date(now()),
  entered_by uuid not null references users(id), channel entry_channel not null default 'form',
  device_id text, note text,
  voided_at timestamptz, voided_by uuid references users(id), void_reason text
);
create table trip_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references trip_receipts(id),
  trip_line_id uuid not null references trip_lines(id),
  qty_received numeric(10,3) not null check (qty_received >= 0)
);

create table pack_runs (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references skus(id),
  packs_made int not null check (packs_made > 0),
  event_at timestamptz not null default now(), entered_at timestamptz not null default now(),
  biz_date date not null default ist_date(now()),
  entered_by uuid not null references users(id), channel entry_channel not null default 'form',
  device_id text, note text,
  voided_at timestamptz, voided_by uuid references users(id), void_reason text
);
create table pack_run_lots (
  id uuid primary key default gen_random_uuid(),
  pack_run_id uuid not null references pack_runs(id),
  lot_id uuid not null references lots(id),
  qty_packed numeric(10,3) not null check (qty_packed >= 0),
  qty_graded_out numeric(10,3) not null default 0 check (qty_graded_out >= 0)
);

create table delivery_notes (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null,
  flipkart_ref text,
  status text not null default 'confirmed' check (status in ('draft','confirmed')),
  media_id uuid references media(id),
  event_at timestamptz not null default now(), entered_at timestamptz not null default now(),
  biz_date date not null default ist_date(now()),
  entered_by uuid not null references users(id), channel entry_channel not null default 'form',
  device_id text, note text,
  voided_at timestamptz, voided_by uuid references users(id), void_reason text
);
create table delivery_note_lines (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references delivery_notes(id),
  sku_id uuid not null references skus(id),
  printed_qty int not null check (printed_qty >= 0),
  accepted_qty int not null,
  reason text check (reason in ('size','freshness','damage','colour','weight_count','short_supply','late','other')),
  check (accepted_qty between 0 and printed_qty)
);

create table stock_counts (
  id uuid primary key default gen_random_uuid(),
  event_at timestamptz not null default now(), entered_at timestamptz not null default now(),
  biz_date date not null default ist_date(now()),
  entered_by uuid not null references users(id), channel entry_channel not null default 'form',
  device_id text, note text,
  voided_at timestamptz, voided_by uuid references users(id), void_reason text
);
create table stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references stock_counts(id),
  lot_id uuid not null references lots(id),
  fresh_qty numeric(10,3) not null check (fresh_qty >= 0),
  local_only_qty numeric(10,3) not null check (local_only_qty >= 0),
  write_off_qty numeric(10,3) not null default 0 check (write_off_qty >= 0)
);

create table local_sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  lot_id uuid not null references lots(id),
  from_state stock_state not null default 'local_only',
  qty numeric(10,3) not null check (qty > 0),
  rate_paise numeric(12,2) not null check (rate_paise >= 0),
  amount_paise numeric generated always as (round(qty * rate_paise)) stored,
  pay_mode pay_mode not null default 'cash',
  event_at timestamptz not null default now(), entered_at timestamptz not null default now(),
  biz_date date not null default ist_date(now()),
  entered_by uuid not null references users(id), channel entry_channel not null default 'form',
  device_id text, note text,
  voided_at timestamptz, voided_by uuid references users(id), void_reason text
);

create table costs (
  id uuid primary key default gen_random_uuid(),
  cost_type_id uuid not null references cost_types(id),
  amount_paise integer not null check (amount_paise > 0),
  trip_id uuid references trips(id),
  product_id uuid references products(id),
  event_at timestamptz not null default now(), entered_at timestamptz not null default now(),
  biz_date date not null default ist_date(now()),
  entered_by uuid not null references users(id), channel entry_channel not null default 'form',
  device_id text, note text,
  voided_at timestamptz, voided_by uuid references users(id), void_reason text
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  amount_paise integer not null check (amount_paise > 0),   -- cash actually received
  source text not null default 'flipkart',
  reference text,
  event_at timestamptz not null default now(), entered_at timestamptz not null default now(),
  biz_date date not null default ist_date(now()),
  entered_by uuid not null references users(id), channel entry_channel not null default 'form',
  device_id text, note text,
  voided_at timestamptz, voided_by uuid references users(id), void_reason text
);
create table deductions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id),
  type text not null,
  amount_paise integer not null check (amount_paise > 0),
  note text
);

create table inbox_items (
  id uuid primary key default gen_random_uuid(),
  channel entry_channel not null,
  raw_text text, media_id uuid references media(id),
  extracted jsonb,
  status inbox_status not null default 'needs_review',
  reviewed_by uuid references users(id), reviewed_at timestamptz,
  result_table text, result_id uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- the stock engine
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  event_at timestamptz not null,
  biz_date date not null,
  product_id uuid not null references products(id),
  lot_id uuid not null references lots(id),
  state stock_state not null,
  qty numeric(14,3) not null,                -- in the product's unit (kg or pcs)
  reason move_reason not null,
  source_table text not null,
  source_id uuid not null,
  source_header_id uuid not null,
  is_reversal boolean not null default false
);
create index on stock_movements (lot_id);
create index on stock_movements (product_id, biz_date);
create index on stock_movements (source_header_id);

-- ---------------------------------------------------------------- guards
create function immutable_guard() returns trigger language plpgsql as $$
begin
  raise exception 'Records cannot be edited or deleted. Void the parent record and enter a new one.';
end $$;

create function ledger_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Records cannot be deleted. Void the record instead.';
  end if;
  if (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason' - 'amount_paise')
     <> (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason' - 'amount_paise') then
    raise exception 'Records cannot be edited. Void the record and enter a new one.';
  end if;
  if old.voided_at is not null then
    raise exception 'This record is already voided.';
  end if;
  if new.voided_at is not null then
    if new.void_reason is null or new.voided_by is null then
      raise exception 'A void needs voided_by and a reason.';
    end if;
    insert into audit_log (actor, action, table_name, record_id, detail)
    values (new.voided_by, 'void', tg_table_name, new.id, jsonb_build_object('reason', new.void_reason));
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['orders','purchases','trips','trip_receipts','pack_runs','delivery_notes',
                           'stock_counts','local_sales','costs','payments'] loop
    execute format('create trigger %I_guard before update or delete on %I
                    for each row execute function ledger_guard()', t, t);
  end loop;
  foreach t in array array['order_lines','plan_lines','lots','trip_lines','trip_receipt_lines','pack_run_lots',
                           'delivery_note_lines','stock_count_lines','deductions','media','audit_log',
                           'stock_movements'] loop
    execute format('create trigger %I_immutable before update or delete on %I
                    for each row execute function immutable_guard()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- lots and costs
create function get_or_create_purchase_lot(p_product uuid, p_date date) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into lots (product_id, lot_date, kind) values (p_product, p_date, 'purchase')
  on conflict (product_id, lot_date) where kind = 'purchase' do nothing;
  select id into v from lots where product_id = p_product and lot_date = p_date and kind = 'purchase';
  return v;
end $$;

create function purchases_assign_lot() returns trigger language plpgsql as $$
begin
  if new.lot_id is null then
    new.lot_id := get_or_create_purchase_lot(new.product_id, new.biz_date);
  end if;
  return new;
end $$;
create trigger purchases_lot before insert on purchases
  for each row execute function purchases_assign_lot();

create view lot_costs as
select l.id as lot_id, l.product_id, l.lot_date, l.kind,
       coalesce(p.qty, 0) as qty_bought,
       coalesce(p.amount, 0) as amount_paise,
       coalesce(l.unit_cost_override_paise, p.amount / nullif(p.qty, 0)) as unit_cost_paise
from lots l
left join (select lot_id, sum(qty) as qty, sum(qty * rate_paise) as amount
           from purchases where voided_at is null group by lot_id) p on p.lot_id = l.id;

create view pack_run_costs as
select r.id as pack_run_id, r.sku_id, s.product_id, r.biz_date, r.packs_made, s.base_qty_per_pack,
       sum(x.qty_packed) as qty_packed, sum(x.qty_graded_out) as qty_graded_out,
       sum((x.qty_packed + x.qty_graded_out) * c.unit_cost_paise)
         / nullif(sum(x.qty_packed + x.qty_graded_out), 0) as unit_cost_paise
from pack_runs r
join skus s on s.id = r.sku_id
join pack_run_lots x on x.pack_run_id = r.id
join lot_costs c on c.lot_id = x.lot_id
where r.voided_at is null
group by r.id, r.sku_id, s.product_id, r.biz_date, r.packs_made, s.base_qty_per_pack;

create view sku_day_unit_cost as
select sku_id, biz_date,
       sum(qty_packed * unit_cost_paise) / nullif(sum(qty_packed), 0) as unit_cost_paise
from pack_run_costs group by sku_id, biz_date;

-- Cost per base unit for a sku on a day: that day's pack run cost, else the latest purchase lot cost.
create function unit_cost_for_sku(p_sku uuid, p_date date) returns numeric
language sql stable as $$
  select coalesce(
    (select unit_cost_paise from sku_day_unit_cost where sku_id = p_sku and biz_date = p_date),
    (select c.unit_cost_paise from lot_costs c join skus s on s.product_id = c.product_id
      where s.id = p_sku and c.kind = 'purchase' and c.lot_date <= p_date and c.unit_cost_paise is not null
      order by c.lot_date desc limit 1))
$$;

-- ---------------------------------------------------------------- posting stock movements
create function post_move(p_at timestamptz, p_biz date, p_product uuid, p_lot uuid, p_state stock_state,
                          p_qty numeric, p_reason move_reason, p_src_table text, p_src_id uuid, p_header uuid)
returns void language plpgsql as $$
begin
  if p_qty = 0 then return; end if;
  insert into stock_movements (event_at, biz_date, product_id, lot_id, state, qty, reason,
                               source_table, source_id, source_header_id)
  values (p_at, p_biz, p_product, p_lot, p_state, p_qty, p_reason, p_src_table, p_src_id, p_header);
end $$;

create function post_receipt_line() returns trigger language plpgsql as $$
declare tl trip_lines%rowtype; t trips%rowtype; r trip_receipts%rowtype;
        v_base numeric; v_cost numeric; v_lot uuid; v_lost numeric;
begin
  select * into tl from trip_lines where id = new.trip_line_id;
  select * into r from trip_receipts where id = new.receipt_id;
  select * into t from trips where id = tl.trip_id;
  if r.trip_id <> t.id then raise exception 'This receipt line belongs to a different trip.'; end if;
  if new.qty_received > tl.qty_sent then raise exception 'Received more than was sent. Check the numbers.'; end if;
  v_lost := tl.qty_sent - new.qty_received;
  if t.leg = 'to_warehouse' then
    perform post_move(r.event_at, r.biz_date, tl.product_id, tl.lot_id, 'fresh', tl.qty_sent,
                      'purchase_in', 'trip_receipt_lines', new.id, r.id);
    perform post_move(r.event_at, r.biz_date, tl.product_id, tl.lot_id, 'fresh', -v_lost,
                      'transit_loss', 'trip_receipt_lines', new.id, r.id);
  elsif t.leg = 'return' then
    select base_qty_per_pack into v_base from skus where id = tl.sku_id;
    v_cost := unit_cost_for_sku(tl.sku_id, t.biz_date);
    insert into lots (product_id, lot_date, kind, unit_cost_override_paise)
    values (tl.product_id, r.biz_date, 'return', v_cost) returning id into v_lot;
    perform post_move(r.event_at, r.biz_date, tl.product_id, v_lot, 'local_only', tl.qty_sent * v_base,
                      'return_reject', 'trip_receipt_lines', new.id, r.id);
    perform post_move(r.event_at, r.biz_date, tl.product_id, v_lot, 'local_only', -v_lost * v_base,
                      'transit_loss', 'trip_receipt_lines', new.id, r.id);
  end if;
  return new;
end $$;
create trigger receipt_line_posts after insert on trip_receipt_lines
  for each row execute function post_receipt_line();

create function post_pack_lot() returns trigger language plpgsql as $$
declare r pack_runs%rowtype; p uuid; lp uuid;
begin
  select * into r from pack_runs where id = new.pack_run_id;
  select product_id into p from skus where id = r.sku_id;
  select product_id into lp from lots where id = new.lot_id;
  if p <> lp then raise exception 'This lot is a different product from the pack size.'; end if;
  perform post_move(r.event_at, r.biz_date, p, new.lot_id, 'fresh', -new.qty_packed,
                    'packed', 'pack_run_lots', new.id, r.id);
  perform post_move(r.event_at, r.biz_date, p, new.lot_id, 'fresh', -new.qty_graded_out,
                    'graded_out', 'pack_run_lots', new.id, r.id);
  return new;
end $$;
create trigger pack_lot_posts after insert on pack_run_lots
  for each row execute function post_pack_lot();

create function post_local_sale() returns trigger language plpgsql as $$
begin
  perform post_move(new.event_at, new.biz_date, new.product_id, new.lot_id, new.from_state, -new.qty,
                    'sold_local', 'local_sales', new.id, new.id);
  return new;
end $$;
create trigger local_sale_posts after insert on local_sales
  for each row execute function post_local_sale();

-- Write-offs and count differences are posted against fresh, then stock is moved between
-- states so that on hand matches what was counted.
create function post_count_line() returns trigger language plpgsql as $$
declare c stock_counts%rowtype; p uuid; f0 numeric; l0 numeric; adj numeric; x numeric;
begin
  select * into c from stock_counts where id = new.count_id;
  select product_id into p from lots where id = new.lot_id;
  select coalesce(sum(qty) filter (where state = 'fresh'), 0),
         coalesce(sum(qty) filter (where state = 'local_only'), 0)
    into f0, l0 from stock_movements where lot_id = new.lot_id;
  adj := (new.fresh_qty + new.local_only_qty + new.write_off_qty) - (f0 + l0);
  x := new.local_only_qty - l0;
  perform post_move(c.event_at, c.biz_date, p, new.lot_id, 'fresh', -new.write_off_qty,
                    'written_off', 'stock_count_lines', new.id, c.id);
  perform post_move(c.event_at, c.biz_date, p, new.lot_id, 'fresh', adj,
                    'count_adjust', 'stock_count_lines', new.id, c.id);
  perform post_move(c.event_at, c.biz_date, p, new.lot_id, 'fresh', -x,
                    'state_change', 'stock_count_lines', new.id, c.id);
  perform post_move(c.event_at, c.biz_date, p, new.lot_id, 'local_only', x,
                    'state_change', 'stock_count_lines', new.id, c.id);
  return new;
end $$;
create trigger count_line_posts after insert on stock_count_lines
  for each row execute function post_count_line();

-- Voiding a header reverses every stock movement it created.
create function reverse_movements_on_void() returns trigger language plpgsql as $$
begin
  if new.voided_at is not null and old.voided_at is null then
    insert into stock_movements (event_at, biz_date, product_id, lot_id, state, qty, reason,
                                 source_table, source_id, source_header_id, is_reversal)
    select now(), biz_date, product_id, lot_id, state, -qty, reason,
           source_table, source_id, source_header_id, true
    from stock_movements where source_header_id = new.id and not is_reversal;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['trip_receipts','pack_runs','local_sales','stock_counts'] loop
    execute format('create trigger %I_reverse after update on %I
                    for each row execute function reverse_movements_on_void()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- stock views
create view stock_on_hand as
select m.product_id, m.lot_id, l.lot_date, l.kind, m.state, sum(m.qty) as qty,
       sum(m.qty) * c.unit_cost_paise as value_paise
from stock_movements m
join lots l on l.id = m.lot_id
join lot_costs c on c.lot_id = m.lot_id
group by m.product_id, m.lot_id, l.lot_date, l.kind, m.state, c.unit_cost_paise
having sum(m.qty) <> 0;

create view negative_stock_alerts as
select product_id, lot_id, sum(qty) as qty
from stock_movements group by product_id, lot_id having sum(qty) < -0.0005;

create view stock_book_daily as
with d as (
  select product_id, biz_date,
    sum(qty) filter (where reason = 'purchase_in')    as purchase_in,
    sum(qty) filter (where reason = 'transit_loss')   as transit_loss,
    sum(qty) filter (where reason = 'packed')         as packed,
    sum(qty) filter (where reason = 'graded_out')     as graded_out,
    sum(qty) filter (where reason = 'return_reject')  as return_reject,
    sum(qty) filter (where reason = 'sold_local')     as sold_local,
    sum(qty) filter (where reason = 'written_off')    as written_off,
    sum(qty) filter (where reason = 'count_adjust')   as count_adjust,
    sum(qty) as net
  from stock_movements group by product_id, biz_date)
select d.*,
  coalesce(sum(net) over (partition by product_id order by biz_date
           rows between unbounded preceding and 1 preceding), 0) as opening,
  coalesce(sum(net) over (partition by product_id order by biz_date
           rows between unbounded preceding and current row), 0) as closing
from d;

-- ---------------------------------------------------------------- profit building blocks
create view losses_valued as
select m.product_id, m.biz_date, m.reason,
       -sum(m.qty) as qty_lost,
       -sum(m.qty * coalesce(c.unit_cost_paise, 0)) as value_paise
from stock_movements m join lot_costs c on c.lot_id = m.lot_id
where m.reason in ('transit_loss','graded_out','written_off','count_adjust')
group by m.product_id, m.biz_date, m.reason;

create view giveaway_daily as
select product_id, biz_date,
       sum(qty_packed - packs_made * base_qty_per_pack) as qty,
       sum((qty_packed - packs_made * base_qty_per_pack) * coalesce(unit_cost_paise, 0)) as value_paise
from pack_run_costs group by product_id, biz_date;

create view flipkart_daily as
select n.delivery_date as biz_date, s.product_id, l.sku_id,
       sum(l.printed_qty) as printed_qty, sum(l.accepted_qty) as accepted_qty,
       rt.rate_paise,
       sum(l.accepted_qty) * coalesce(rt.rate_paise, 0) as revenue_paise,
       sum(l.accepted_qty) * s.base_qty_per_pack * coalesce(unit_cost_for_sku(l.sku_id, n.delivery_date), 0) as cogs_paise,
       rt.rate_paise is null as rate_missing,
       unit_cost_for_sku(l.sku_id, n.delivery_date) is null as cost_missing
from delivery_note_lines l
join delivery_notes n on n.id = l.note_id and n.voided_at is null and n.status = 'confirmed'
join skus s on s.id = l.sku_id
left join lateral (select r.rate_paise from flipkart_rates r
                   where r.sku_id = l.sku_id and r.valid_from <= n.delivery_date
                     and (r.valid_to is null or r.valid_to > n.delivery_date)
                   order by r.valid_from desc limit 1) rt on true
group by n.delivery_date, s.product_id, l.sku_id, s.base_qty_per_pack, rt.rate_paise;

create view local_daily as
select ls.biz_date, ls.product_id,
       sum(ls.amount_paise) as revenue_paise,
       sum(ls.qty * coalesce(c.unit_cost_paise, 0)) as cogs_paise,
       sum(ls.amount_paise) filter (where ls.pay_mode = 'cash') as cash_paise
from local_sales ls join lot_costs c on c.lot_id = ls.lot_id
where ls.voided_at is null group by ls.biz_date, ls.product_id;

create view kg_handled_daily as
select m.biz_date, m.product_id,
       sum(m.qty) * case when p.unit = 'kg' then 1 else p.avg_weight_kg end as kg_handled
from stock_movements m join products p on p.id = m.product_id
where m.reason = 'purchase_in'
group by m.biz_date, m.product_id, p.unit, p.avg_weight_kg;

create view variable_costs_daily as
select c.biz_date, sum(c.amount_paise) as amount_paise
from costs c join cost_types t on t.id = c.cost_type_id
where c.voided_at is null and t.kind = 'variable' group by c.biz_date;

create view fixed_costs_monthly as
select date_trunc('month', c.biz_date)::date as month, sum(c.amount_paise) as amount_paise
from costs c join cost_types t on t.id = c.cost_type_id
where c.voided_at is null and t.kind = 'fixed' group by 1;

create view deductions_daily as
select pay.biz_date, sum(d.amount_paise) as amount_paise
from deductions d join payments pay on pay.id = d.payment_id
where pay.voided_at is null group by pay.biz_date;

-- Profit by product and day. Variable costs (transport and similar) are shared by kg handled
-- that day; fixed costs (rent, salaries) by kg handled that month.
create view profit_daily_product as
with keys as (
  select biz_date, product_id from flipkart_daily
  union select biz_date, product_id from local_daily
  union select biz_date, product_id from losses_valued
  union select biz_date, product_id from giveaway_daily
  union select biz_date, product_id from kg_handled_daily),
fk as (select biz_date, product_id, sum(revenue_paise) as rev, sum(cogs_paise) as cogs
       from flipkart_daily group by 1, 2),
lo as (select biz_date, product_id, sum(value_paise) as val from losses_valued group by 1, 2),
kg as (select k.biz_date, k.product_id, k.kg_handled,
              sum(k.kg_handled) over (partition by k.biz_date) as day_kg,
              greatest(sum(k.kg_handled) over (partition by date_trunc('month', k.biz_date)),
                       coalesce(e.kg, 0)) as month_kg
       from kg_handled_daily k
       left join kg_estimates e on e.month = date_trunc('month', k.biz_date)::date)
select x.*,
  x.revenue_flipkart_paise + x.revenue_local_paise - x.cogs_flipkart_paise - x.cogs_local_paise
    - x.losses_paise - x.giveaway_paise - x.variable_costs_paise - x.fixed_costs_paise as profit_paise
from (
  select k.biz_date, k.product_id,
    coalesce(fk.rev, 0)  as revenue_flipkart_paise,
    coalesce(ld.revenue_paise, 0) as revenue_local_paise,
    coalesce(fk.cogs, 0) as cogs_flipkart_paise,
    coalesce(ld.cogs_paise, 0) as cogs_local_paise,
    coalesce(lo.val, 0)  as losses_paise,
    coalesce(gd.value_paise, 0) as giveaway_paise,
    coalesce(vc.amount_paise * kg.kg_handled / nullif(kg.day_kg, 0), 0) as variable_costs_paise,
    coalesce(fc.amount_paise * kg.kg_handled / nullif(kg.month_kg, 0), 0) as fixed_costs_paise
  from keys k
  left join fk on fk.biz_date = k.biz_date and fk.product_id = k.product_id
  left join local_daily ld on ld.biz_date = k.biz_date and ld.product_id = k.product_id
  left join lo on lo.biz_date = k.biz_date and lo.product_id = k.product_id
  left join giveaway_daily gd on gd.biz_date = k.biz_date and gd.product_id = k.product_id
  left join kg on kg.biz_date = k.biz_date and kg.product_id = k.product_id
  left join variable_costs_daily vc on vc.biz_date = k.biz_date
  left join fixed_costs_monthly fc on fc.month = date_trunc('month', k.biz_date)::date
) x;

create view profit_daily as
with p as (
  select biz_date,
    sum(revenue_flipkart_paise) as revenue_flipkart_paise, sum(revenue_local_paise) as revenue_local_paise,
    sum(cogs_flipkart_paise) as cogs_flipkart_paise, sum(cogs_local_paise) as cogs_local_paise,
    sum(losses_paise) as losses_paise, sum(giveaway_paise) as giveaway_paise,
    sum(variable_costs_paise) as variable_costs_paise, sum(fixed_costs_paise) as fixed_costs_paise,
    sum(profit_paise) as profit_paise
  from profit_daily_product group by biz_date),
days as (select biz_date from p union select biz_date from variable_costs_daily
         union select biz_date from deductions_daily)
select d.biz_date,
  coalesce(p.revenue_flipkart_paise, 0) as revenue_flipkart_paise,
  coalesce(p.revenue_local_paise, 0) as revenue_local_paise,
  coalesce(p.cogs_flipkart_paise, 0) as cogs_flipkart_paise,
  coalesce(p.cogs_local_paise, 0) as cogs_local_paise,
  coalesce(p.losses_paise, 0) as losses_paise,
  coalesce(p.giveaway_paise, 0) as giveaway_paise,
  coalesce(p.variable_costs_paise, 0) as variable_costs_allocated_paise,
  coalesce(vc.amount_paise, 0) - coalesce(p.variable_costs_paise, 0) as variable_costs_unallocated_paise,
  coalesce(p.fixed_costs_paise, 0) as fixed_costs_paise,
  coalesce(dd.amount_paise, 0) as flipkart_deductions_paise,
  coalesce(p.profit_paise, 0)
    - (coalesce(vc.amount_paise, 0) - coalesce(p.variable_costs_paise, 0))
    - coalesce(dd.amount_paise, 0) as profit_paise
from days d
left join p on p.biz_date = d.biz_date
left join variable_costs_daily vc on vc.biz_date = d.biz_date
left join deductions_daily dd on dd.biz_date = d.biz_date;

-- Fixed costs not yet shared out (the month is not over, or the estimate was higher than reality).
create view fixed_costs_unallocated_monthly as
select f.month, f.amount_paise as fixed_paise,
       coalesce(a.allocated, 0) as allocated_paise,
       f.amount_paise - coalesce(a.allocated, 0) as unallocated_paise
from fixed_costs_monthly f
left join (select date_trunc('month', biz_date)::date as month, sum(fixed_costs_paise) as allocated
           from profit_daily_product group by 1) a on a.month = f.month;

create view profit_monthly as
select date_trunc('month', d.biz_date)::date as month,
       sum(d.profit_paise) as profit_daily_total_paise,
       coalesce(max(u.unallocated_paise), 0) as fixed_unallocated_paise,
       sum(d.profit_paise) - coalesce(max(u.unallocated_paise), 0) as net_profit_paise
from profit_daily d
left join fixed_costs_unallocated_monthly u on u.month = date_trunc('month', d.biz_date)::date
group by 1;

create view cash_daily as
with days as (
  select biz_date from purchases union select biz_date from costs
  union select biz_date from local_sales union select biz_date from payments)
select d.biz_date,
  coalesce((select sum(round(qty * rate_paise)) from purchases x where x.biz_date = d.biz_date and x.voided_at is null), 0)
  + coalesce((select sum(amount_paise) from costs x where x.biz_date = d.biz_date and x.voided_at is null), 0) as cash_out_paise,
  coalesce((select sum(amount_paise) from local_sales x where x.biz_date = d.biz_date and x.voided_at is null and x.pay_mode = 'cash'), 0)
  + coalesce((select sum(amount_paise) from payments x where x.biz_date = d.biz_date and x.voided_at is null), 0) as cash_in_paise
from days d;

create view flipkart_receivable as
select
  (select coalesce(sum(revenue_paise), 0) from flipkart_daily) as billed_paise,
  (select coalesce(sum(amount_paise), 0) from payments where voided_at is null) as received_paise,
  (select coalesce(sum(amount_paise), 0) from deductions_daily) as deducted_paise,
  (select coalesce(sum(revenue_paise), 0) from flipkart_daily)
    - (select coalesce(sum(amount_paise), 0) from payments where voided_at is null)
    - (select coalesce(sum(amount_paise), 0) from deductions_daily) as owed_paise;

-- ---------------------------------------------------------------- quality views
create view fill_rate_daily as
select n.delivery_date as biz_date, sum(l.printed_qty) as ordered_packs, sum(l.accepted_qty) as accepted_packs,
       sum(l.accepted_qty)::numeric / nullif(sum(l.printed_qty), 0) as fill_rate
from delivery_note_lines l join delivery_notes n on n.id = l.note_id
where n.voided_at is null and n.status = 'confirmed' group by n.delivery_date;

create view shortfall_by_reason as
select n.delivery_date as biz_date, l.sku_id, coalesce(l.reason, 'no_reason') as reason,
       sum(l.printed_qty - l.accepted_qty) as short_packs
from delivery_note_lines l join delivery_notes n on n.id = l.note_id
where n.voided_at is null and n.status = 'confirmed' and l.printed_qty > l.accepted_qty
group by n.delivery_date, l.sku_id, coalesce(l.reason, 'no_reason');

-- Packs made, minus accepted, minus returned. Should be zero once the day is closed.
create view packs_outstanding_daily as
with made as (select biz_date, sku_id, sum(packs_made) as packs from pack_runs where voided_at is null group by 1, 2),
acc as (select n.delivery_date as biz_date, l.sku_id, sum(l.accepted_qty) as packs
        from delivery_note_lines l join delivery_notes n on n.id = l.note_id
        where n.voided_at is null and n.status = 'confirmed' group by 1, 2),
ret as (select t.biz_date, tl.sku_id, sum(tl.qty_sent) as packs
        from trip_lines tl join trips t on t.id = tl.trip_id
        join trip_receipts r on r.trip_id = t.id and r.voided_at is null
        where t.leg = 'return' and t.voided_at is null group by 1, 2)
select made.biz_date, made.sku_id, made.packs as packs_made,
       coalesce(acc.packs, 0) as packs_accepted, coalesce(ret.packs, 0) as packs_returned,
       made.packs - coalesce(acc.packs, 0) - coalesce(ret.packs, 0) as packs_outstanding
from made left join acc using (biz_date, sku_id) left join ret using (biz_date, sku_id);

-- ---------------------------------------------------------------- plan and count helpers
create function extra_pct_learned(p_product uuid, p_before date, p_days int default 7) returns numeric
language sql stable as $$
  select case when loss is null then null when loss <= 0 then 0 else loss / (1 - loss) end
  from (select 1 - sum(l.accepted_qty)::numeric / nullif(sum(l.printed_qty), 0) as loss
        from delivery_note_lines l
        join delivery_notes n on n.id = l.note_id and n.voided_at is null and n.status = 'confirmed'
        join skus s on s.id = l.sku_id
        where s.product_id = p_product and n.delivery_date < p_before
          and n.delivery_date >= p_before - p_days) q
$$;

-- Morning plan for a delivery date: kg (or pieces) to buy per product.
create function buying_plan_calc(p_date date, p_cap numeric default 0.25)
returns table (product_id uuid, name_en text, unit unit_kind, order_qty numeric, extra_pct numeric,
               learned_extra_pct numeric, too_high boolean, fresh_stock numeric, qty_to_buy numeric)
language sql stable as $$
  with need as (
    select s.product_id, sum(ol.packs_ordered * s.base_qty_per_pack) as order_qty
    from orders o join order_lines ol on ol.order_id = o.id join skus s on s.id = ol.sku_id
    where o.delivery_date = p_date and o.voided_at is null group by s.product_id),
  fresh as (
    select h.product_id, sum(h.qty) as qty
    from stock_on_hand h join products p on p.id = h.product_id
    where h.state = 'fresh' and h.kind = 'purchase' and h.lot_date >= p_date - p.max_fresh_days
    group by h.product_id)
  select p.id, p.name_en, p.unit, n.order_qty,
         coalesce(p.extra_pct_override, least(coalesce(extra_pct_learned(p.id, p_date), 0), p_cap)) as extra_pct,
         extra_pct_learned(p.id, p_date) as learned_extra_pct,
         coalesce(extra_pct_learned(p.id, p_date), 0) > p_cap as too_high,
         coalesce(f.qty, 0) as fresh_stock,
         greatest(0, case when p.unit = 'pcs'
           then ceil(n.order_qty * (1 + coalesce(p.extra_pct_override, least(coalesce(extra_pct_learned(p.id, p_date), 0), p_cap))) - coalesce(f.qty, 0))
           else round(n.order_qty * (1 + coalesce(p.extra_pct_override, least(coalesce(extra_pct_learned(p.id, p_date), 0), p_cap))) - coalesce(f.qty, 0), 1) end) as qty_to_buy
  from need n join products p on p.id = n.product_id left join fresh f on f.product_id = p.id
$$;

-- Pre-filled evening count: fresh only while the stock will still be inside its fresh age tomorrow.
create function count_defaults(p_count_date date)
returns table (product_id uuid, lot_id uuid, lot_date date, expected_qty numeric,
               default_fresh numeric, default_local_only numeric)
language sql stable as $$
  with h as (select product_id, lot_id, lot_date,
               coalesce(sum(qty) filter (where state = 'fresh'), 0) as f,
               coalesce(sum(qty) filter (where state = 'local_only'), 0) as l
             from stock_on_hand group by product_id, lot_id, lot_date)
  select h.product_id, h.lot_id, h.lot_date, h.f + h.l,
         case when (p_count_date + 1 - h.lot_date) <= p.max_fresh_days then h.f else 0 end,
         h.l + case when (p_count_date + 1 - h.lot_date) <= p.max_fresh_days then 0 else h.f end
  from h join products p on p.id = h.product_id where h.f + h.l > 0
$$;
