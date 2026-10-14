-- ====================================================================
-- ELITE GREEN FNV — FRESH START RESET SCRIPT
-- Safely truncates operational test data while keeping Master Catalog & Users
-- ====================================================================

BEGIN;

-- 1. Disable ledger guards temporarily for reset
ALTER TABLE orders DISABLE TRIGGER orders_ledger_guard;
ALTER TABLE purchases DISABLE TRIGGER purchases_ledger_guard;
ALTER TABLE delivery_notes DISABLE TRIGGER delivery_notes_ledger_guard;
ALTER TABLE local_sales DISABLE TRIGGER local_sales_ledger_guard;
ALTER TABLE cash_ledger_entries DISABLE TRIGGER cash_ledger_guard;

-- 2. Truncate all transactional & movement tables
TRUNCATE TABLE 
  stock_movements,
  cash_ledger_entries,
  audit_log,
  local_sales,
  delivery_note_items,
  delivery_notes,
  dispatches,
  packing_records,
  lots,
  trip_crates,
  trips,
  purchases,
  daily_counts,
  orders
CASCADE;

-- 3. Re-enable ledger guards
ALTER TABLE orders ENABLE TRIGGER orders_ledger_guard;
ALTER TABLE purchases ENABLE TRIGGER purchases_ledger_guard;
ALTER TABLE delivery_notes ENABLE TRIGGER delivery_notes_ledger_guard;
ALTER TABLE local_sales ENABLE TRIGGER local_sales_ledger_guard;
ALTER TABLE cash_ledger_entries ENABLE TRIGGER cash_ledger_guard;

COMMIT;

-- Verification: Should all return 0 rows
SELECT 'orders' AS tbl, count(*) FROM orders
UNION ALL SELECT 'purchases', count(*) FROM purchases
UNION ALL SELECT 'trips', count(*) FROM trips
UNION ALL SELECT 'lots', count(*) FROM lots
UNION ALL SELECT 'stock_movements', count(*) FROM stock_movements
UNION ALL SELECT 'local_sales', count(*) FROM local_sales;
