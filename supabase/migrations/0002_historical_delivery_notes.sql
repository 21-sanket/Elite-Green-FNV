-- Migration 0002: Seed base reference data & historical delivery notes (2 Oct, 3 Oct 2026)
-- Real data from Flipkart delivery notes. No purchases or pack runs behind these.
-- Useful for fill_rate_daily and extra_pct_learned().

do $$
declare
  o uuid;
  v_note uuid;
  v_beans_250g uuid;
  v_beet_500g uuid;
  v_beet_300g uuid;
  v_bharta_500g uuid;
  v_purple_500g uuid;
  v_gourd_1unit uuid;
begin
  -- 1. Ensure Owner user exists and retrieve id (cannot be null)
  select id into o from users where role = 'owner' limit 1;
  if o is null then
    insert into users (name, role, language)
    values ('Owner', 'owner', 'en')
    returning id into o;
  end if;

  -- Ensure other base roles exist
  if not exists (select 1 from users where role = 'buyer') then
    insert into users (name, role, language) values ('Buyer', 'buyer', 'hi');
  end if;
  if not exists (select 1 from users where role = 'supervisor') then
    insert into users (name, role, language) values ('Supervisor', 'supervisor', 'hi');
  end if;
  if not exists (select 1 from users where role = 'delivery') then
    insert into users (name, role, language) values ('Delivery', 'delivery', 'hi');
  end if;
  if not exists (select 1 from users where role = 'seller') then
    insert into users (name, role, language) values ('Seller', 'seller', 'hi');
  end if;

  -- 2. Ensure base products exist
  insert into products (name_en, name_hi, unit, avg_weight_kg) values
    ('French Beans', 'फ्रेंच बीन्स', 'kg', null),
    ('Beetroot', 'चुकंदर', 'kg', null),
    ('Brinjal Bharta', 'बैंगन भर्ता', 'kg', null),
    ('Long Purple Brinjal', 'लंबा बैंगनी बैंगन', 'kg', null),
    ('Round Bottle Gourd', 'गोल लौकी', 'pcs', 0.525)
  on conflict (name_en) do nothing;

  -- 3. Ensure base SKUs exist
  insert into skus (product_id, label, base_qty_per_pack)
  select p.id, '250g', 0.25 from products p where p.name_en = 'French Beans'
  on conflict (product_id, label) do nothing;

  insert into skus (product_id, label, base_qty_per_pack)
  select p.id, '500g', 0.5 from products p where p.name_en = 'Beetroot'
  on conflict (product_id, label) do nothing;

  insert into skus (product_id, label, base_qty_per_pack)
  select p.id, '300g', 0.3 from products p where p.name_en = 'Beetroot'
  on conflict (product_id, label) do nothing;

  insert into skus (product_id, label, base_qty_per_pack)
  select p.id, '500g', 0.5 from products p where p.name_en = 'Brinjal Bharta'
  on conflict (product_id, label) do nothing;

  insert into skus (product_id, label, base_qty_per_pack)
  select p.id, '500g', 0.5 from products p where p.name_en = 'Long Purple Brinjal'
  on conflict (product_id, label) do nothing;

  insert into skus (product_id, label, base_qty_per_pack)
  select p.id, '1 unit', 1 from products p where p.name_en = 'Round Bottle Gourd'
  on conflict (product_id, label) do nothing;

  -- Resolve SKU IDs into variables
  select s.id into v_beans_250g from skus s join products p on p.id = s.product_id where p.name_en = 'French Beans' and s.label = '250g';
  select s.id into v_beet_500g from skus s join products p on p.id = s.product_id where p.name_en = 'Beetroot' and s.label = '500g';
  select s.id into v_beet_300g from skus s join products p on p.id = s.product_id where p.name_en = 'Beetroot' and s.label = '300g';
  select s.id into v_bharta_500g from skus s join products p on p.id = s.product_id where p.name_en = 'Brinjal Bharta' and s.label = '500g';
  select s.id into v_purple_500g from skus s join products p on p.id = s.product_id where p.name_en = 'Long Purple Brinjal' and s.label = '500g';
  select s.id into v_gourd_1unit from skus s join products p on p.id = s.product_id where p.name_en = 'Round Bottle Gourd' and s.label = '1 unit';

  -- 4. 2 Oct delivery note
  if not exists (select 1 from delivery_notes where delivery_date = '2026-10-02' and voided_at is null) then
    insert into delivery_notes (delivery_date, biz_date, entered_by, status)
    values ('2026-10-02', '2026-10-02', o, 'confirmed') returning id into v_note;

    insert into delivery_note_lines (note_id, sku_id, printed_qty, accepted_qty) values
      (v_note, v_beans_250g, 42, 42),
      (v_note, v_purple_500g, 109, 109),
      (v_note, v_bharta_500g, 46, 37);
  end if;

  -- 5. 3 Oct delivery note
  if not exists (select 1 from delivery_notes where delivery_date = '2026-10-03' and voided_at is null) then
    insert into delivery_notes (delivery_date, biz_date, entered_by, status)
    values ('2026-10-03', '2026-10-03', o, 'confirmed') returning id into v_note;

    insert into delivery_note_lines (note_id, sku_id, printed_qty, accepted_qty) values
      (v_note, v_beans_250g, 52, 47),
      (v_note, v_beet_500g, 55, 54),
      (v_note, v_bharta_500g, 47, 5),
      (v_note, v_purple_500g, 65, 60),
      (v_note, v_beet_300g, 43, 38),
      (v_note, v_gourd_1unit, 28, 10);
  end if;
end $$;
