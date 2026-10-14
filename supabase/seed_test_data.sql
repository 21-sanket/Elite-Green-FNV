-- TEST DATA ONLY. The quantities for 4 Oct come from the real delivery note, but every rate,
-- cost, purchase, and stock figure below is made up so the views have something to calculate.
-- Run after fnv_schema.sql. Do not load into the real database.

create or replace function t_pid(n text) returns uuid language sql as $$ select id from products where name_en = n $$;
create or replace function t_sid(n text, lbl text) returns uuid language sql as
$$ select s.id from skus s join products p on p.id = s.product_id where p.name_en = n and s.label = lbl $$;
create or replace function t_lot(n text, d date) returns uuid language sql as
$$ select id from lots where product_id = t_pid(n) and lot_date = d and kind = 'purchase' $$;
create or replace function t_user(r user_role) returns uuid language sql as $$ select id from users where role = r limit 1 $$;

-- 1. Reference users (idempotent)
insert into users (name, role, language)
select 'Owner', 'owner', 'en' where not exists (select 1 from users where role = 'owner');
insert into users (name, role, language)
select 'Buyer', 'buyer', 'hi' where not exists (select 1 from users where role = 'buyer');
insert into users (name, role, language)
select 'Supervisor', 'supervisor', 'hi' where not exists (select 1 from users where role = 'supervisor');
insert into users (name, role, language)
select 'Delivery', 'delivery', 'hi' where not exists (select 1 from users where role = 'delivery');
insert into users (name, role, language)
select 'Seller', 'seller', 'hi' where not exists (select 1 from users where role = 'seller');

-- 2. Reference products (idempotent)
insert into products (name_en, name_hi, unit, avg_weight_kg) values
  ('French Beans', 'फ्रेंच बीन्स', 'kg', null),
  ('Beetroot', 'चुकंदर', 'kg', null),
  ('Brinjal Bharta', 'बैंगन भर्ता', 'kg', null),
  ('Long Purple Brinjal', 'लंबा बैंगनी बैंगन', 'kg', null),
  ('Round Bottle Gourd', 'गोल लौकी', 'pcs', 0.525)
on conflict (name_en) do nothing;

-- 3. Reference SKUs (idempotent)
insert into skus (product_id, label, base_qty_per_pack) values
  (t_pid('French Beans'), '250g', 0.25),
  (t_pid('Beetroot'), '500g', 0.5),
  (t_pid('Beetroot'), '300g', 0.3),
  (t_pid('Brinjal Bharta'), '500g', 0.5),
  (t_pid('Long Purple Brinjal'), '500g', 0.5),
  (t_pid('Round Bottle Gourd'), '1 unit', 1)
on conflict (product_id, label) do nothing;

-- 4. Flipkart rates (idempotent)
insert into flipkart_rates (sku_id, rate_paise, valid_from)
select t_sid('French Beans','250g'), 1200, '2026-10-01'
where not exists (select 1 from flipkart_rates where sku_id = t_sid('French Beans','250g') and valid_from = '2026-10-01');

insert into flipkart_rates (sku_id, rate_paise, valid_from)
select t_sid('Beetroot','500g'), 1400, '2026-10-01'
where not exists (select 1 from flipkart_rates where sku_id = t_sid('Beetroot','500g') and valid_from = '2026-10-01');

insert into flipkart_rates (sku_id, rate_paise, valid_from)
select t_sid('Beetroot','300g'), 900, '2026-10-01'
where not exists (select 1 from flipkart_rates where sku_id = t_sid('Beetroot','300g') and valid_from = '2026-10-01');

insert into flipkart_rates (sku_id, rate_paise, valid_from)
select t_sid('Brinjal Bharta','500g'), 1600, '2026-10-01'
where not exists (select 1 from flipkart_rates where sku_id = t_sid('Brinjal Bharta','500g') and valid_from = '2026-10-01');

insert into flipkart_rates (sku_id, rate_paise, valid_from)
select t_sid('Long Purple Brinjal','500g'), 1500, '2026-10-01'
where not exists (select 1 from flipkart_rates where sku_id = t_sid('Long Purple Brinjal','500g') and valid_from = '2026-10-01');

insert into flipkart_rates (sku_id, rate_paise, valid_from)
select t_sid('Round Bottle Gourd','1 unit'), 2200, '2026-10-01'
where not exists (select 1 from flipkart_rates where sku_id = t_sid('Round Bottle Gourd','1 unit') and valid_from = '2026-10-01');

-- 5. Estimates, Mandis, and Cost types (idempotent)
insert into kg_estimates (month, kg) values ('2026-10-01', 20000)
on conflict (month) do nothing;

insert into mandis (name) values ('Mandi 1'), ('Mandi 2')
on conflict (name) do nothing;

insert into cost_types (name, kind) values
  ('Transport', 'variable'), ('Packing material', 'variable'), ('Labour', 'variable'),
  ('Rent', 'fixed'), ('Salaries', 'fixed')
on conflict (name) do nothing;

-- 6. Test day transactions (4 Oct 2026)
do $$
declare
  d date := '2026-10-04';
  b uuid := t_user('buyer'); s uuid := t_user('supervisor'); o uuid := t_user('owner');
  dl uuid := t_user('delivery'); se uuid := t_user('seller');
  m1 uuid := (select id from mandis where name = 'Mandi 1'); m2 uuid := (select id from mandis where name = 'Mandi 2');
  v_order uuid; v_trip uuid; v_rc uuid; v_run uuid; v_note uuid; v_count uuid; v_pay uuid;
  r record;
begin
  if not exists (select 1 from orders where delivery_date = d and voided_at is null) then
    -- order for 4 Oct (printed quantities from the real delivery note)
    insert into orders (delivery_date, biz_date, entered_by) values (d, d, o) returning id into v_order;
    insert into order_lines (order_id, sku_id, packs_ordered) values
      (v_order, t_sid('French Beans','250g'), 24), (v_order, t_sid('Beetroot','500g'), 70),
      (v_order, t_sid('Brinjal Bharta','500g'), 49), (v_order, t_sid('Long Purple Brinjal','500g'), 50),
      (v_order, t_sid('Beetroot','300g'), 13), (v_order, t_sid('Round Bottle Gourd','1 unit'), 62);

    -- purchases: two buys of beans and brinjal at different rates
    insert into purchases (product_id, mandi_id, qty, rate_paise, biz_date, entered_by) values
      (t_pid('French Beans'), m1, 4, 3000, d, b), (t_pid('French Beans'), m2, 3, 3500, d, b),
      (t_pid('Beetroot'), m1, 42, 2000, d, b),
      (t_pid('Brinjal Bharta'), m1, 20, 2200, d, b), (t_pid('Brinjal Bharta'), m2, 8, 2400, d, b),
      (t_pid('Long Purple Brinjal'), m2, 28, 2400, d, b),
      (t_pid('Round Bottle Gourd'), m1, 70, 1400, d, b);

    -- transport 1: mandi to warehouse, sent by buyer, received by supervisor (a little lost in transit)
    insert into trips (leg, driver_name, biz_date, entered_by) values ('to_warehouse', 'Driver A', d, b) returning id into v_trip;
    insert into trip_lines (trip_id, product_id, lot_id, qty_sent, unit) values
      (v_trip, t_pid('French Beans'), t_lot('French Beans', d), 7, 'kg'),
      (v_trip, t_pid('Beetroot'), t_lot('Beetroot', d), 42, 'kg'),
      (v_trip, t_pid('Brinjal Bharta'), t_lot('Brinjal Bharta', d), 28, 'kg'),
      (v_trip, t_pid('Long Purple Brinjal'), t_lot('Long Purple Brinjal', d), 28, 'kg'),
      (v_trip, t_pid('Round Bottle Gourd'), t_lot('Round Bottle Gourd', d), 70, 'pcs');
    insert into trip_receipts (trip_id, biz_date, entered_by) values (v_trip, d, s) returning id into v_rc;
    insert into trip_receipt_lines (receipt_id, trip_line_id, qty_received)
    select v_rc, tl.id, case p.name_en when 'Beetroot' then 41.5 when 'Long Purple Brinjal' then 27.5 else tl.qty_sent end
    from trip_lines tl join products p on p.id = tl.product_id where tl.trip_id = v_trip;
    insert into costs (cost_type_id, amount_paise, trip_id, biz_date, entered_by)
    values ((select id from cost_types where name = 'Transport'), 80000, v_trip, d, o);

    -- packing: one run per sku
    for r in select * from (values
        ('French Beans','250g',24,6.0,0.6), ('Beetroot','500g',70,35.4,1.5), ('Beetroot','300g',13,3.9,0.5),
        ('Brinjal Bharta','500g',49,24.5,1.5), ('Long Purple Brinjal','500g',50,25.0,2.0),
        ('Round Bottle Gourd','1 unit',62,62,3)) as x(prod,lbl,packs,packed,graded) loop
      insert into pack_runs (sku_id, packs_made, biz_date, entered_by)
      values (t_sid(r.prod, r.lbl), r.packs, d, s) returning id into v_run;
      insert into pack_run_lots (pack_run_id, lot_id, qty_packed, qty_graded_out)
      values (v_run, t_lot(r.prod, d), r.packed, r.graded);
    end loop;

    -- transport 2: packs to Flipkart
    insert into trips (leg, driver_name, biz_date, entered_by) values ('to_flipkart', 'Driver B', d, dl) returning id into v_trip;
    insert into trip_lines (trip_id, product_id, sku_id, qty_sent, unit)
    select v_trip, sk.product_id, sk.id, pr.packs_made, 'packs' from pack_runs pr join skus sk on sk.id = pr.sku_id where pr.biz_date = d;
    insert into costs (cost_type_id, amount_paise, trip_id, biz_date, entered_by)
    values ((select id from cost_types where name = 'Transport'), 120000, v_trip, d, o);

    -- Flipkart delivery note (real printed and accepted numbers for 4 Oct)
    insert into delivery_notes (delivery_date, biz_date, entered_by) values (d, d, o) returning id into v_note;
    insert into delivery_note_lines (note_id, sku_id, printed_qty, accepted_qty, reason) values
      (v_note, t_sid('French Beans','250g'), 24, 24, null), (v_note, t_sid('Beetroot','500g'), 70, 70, null),
      (v_note, t_sid('Brinjal Bharta','500g'), 49, 49, null), (v_note, t_sid('Long Purple Brinjal','500g'), 50, 50, null),
      (v_note, t_sid('Beetroot','300g'), 13, 13, null), (v_note, t_sid('Round Bottle Gourd','1 unit'), 62, 48, 'size');

    -- transport 3: 14 rejected bottle gourd packs come back
    insert into trips (leg, driver_name, biz_date, entered_by) values ('return', 'Driver C', d, dl) returning id into v_trip;
    insert into trip_lines (trip_id, product_id, sku_id, qty_sent, unit)
    values (v_trip, t_pid('Round Bottle Gourd'), t_sid('Round Bottle Gourd','1 unit'), 14, 'packs');
    insert into trip_receipts (trip_id, biz_date, entered_by) values (v_trip, d, s) returning id into v_rc;
    insert into trip_receipt_lines (receipt_id, trip_line_id, qty_received)
    select v_rc, id, qty_sent from trip_lines where trip_id = v_trip;
    insert into costs (cost_type_id, amount_paise, trip_id, biz_date, entered_by)
    values ((select id from cost_types where name = 'Transport'), 60000, v_trip, d, o);

    -- local market: sell 10 of the returned bottle gourds
    insert into local_sales (product_id, lot_id, from_state, qty, rate_paise, biz_date, entered_by)
    select t_pid('Round Bottle Gourd'), id, 'local_only', 10, 1000, d, se
    from lots where kind = 'return' and product_id = t_pid('Round Bottle Gourd');

    -- other costs for the day and month
    insert into costs (cost_type_id, amount_paise, biz_date, entered_by) values
      ((select id from cost_types where name = 'Packing material'), 50000, d, o),
      ((select id from cost_types where name = 'Labour'), 100000, d, o),
      ((select id from cost_types where name = 'Rent'), 3000000, '2026-10-01', o),
      ((select id from cost_types where name = 'Salaries'), 4000000, '2026-10-01', o);

    -- evening count. Differences on purpose: brinjal bharta is 0.2 kg short; one returned gourd is spoiled.
    insert into stock_counts (biz_date, entered_by) values (d, s) returning id into v_count;
    insert into stock_count_lines (count_id, lot_id, fresh_qty, local_only_qty, write_off_qty)
    select v_count, c.lot_id,
      case when pn.name_en = 'Brinjal Bharta' then 1.5 when l.kind = 'return' then 0 else c.default_fresh end,
      case when pn.name_en = 'Brinjal Bharta' then 0.3 when l.kind = 'return' then 3 else c.default_local_only end,
      case when l.kind = 'return' then 1 else 0 end
    from count_defaults(d) c join lots l on l.id = c.lot_id join products pn on pn.id = c.product_id;

    -- a Flipkart payment with a deduction
    insert into payments (amount_paise, reference, biz_date, entered_by) values (100000, 'TEST-1', d, o) returning id into v_pay;
    insert into deductions (payment_id, type, amount_paise) values (v_pay, 'fill rate penalty', 5000);

    -- an order for the next day, to exercise the buying plan
    insert into orders (delivery_date, biz_date, entered_by) values ('2026-10-05', d, o) returning id into v_order;
    insert into order_lines (order_id, sku_id, packs_ordered) values
      (v_order, t_sid('Round Bottle Gourd','1 unit'), 60), (v_order, t_sid('French Beans','250g'), 30),
      (v_order, t_sid('Brinjal Bharta','500g'), 40);
  end if;
end $$;
