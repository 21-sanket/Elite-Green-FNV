-- Migration 0004: Settings table and additional views

-- ---------------------------------------------------------------- settings table
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

-- Default settings
insert into settings (key, value) values
  ('flipkart_payment_days', '30'),
  ('default_extra_pct_cap', '0.25')
on conflict (key) do nothing;

alter table settings enable row level security;
create policy "settings_read" on settings for select using (current_app_role() = 'owner');
create policy "settings_write" on settings for insert with check (current_app_role() = 'owner');
create policy "settings_update" on settings for update using (current_app_role() = 'owner');

-- ---------------------------------------------------------------- mandi rate comparison view
create view mandi_rate_comparison as
select p.biz_date, p.product_id, pr.name_en as product_name, pr.name_hi as product_name_hi,
       m.name as mandi, p.qty, p.rate_paise,
       avg(p.rate_paise) over (partition by p.product_id, p.biz_date) as day_avg_paise,
       p.rate_paise - avg(p.rate_paise) over (partition by p.product_id, p.biz_date) as diff_paise
from purchases p
join products pr on pr.id = p.product_id
join mandis m on m.id = p.mandi_id
where p.voided_at is null;
