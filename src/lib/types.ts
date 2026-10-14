// Database types generated from fnv_schema.sql
// These mirror the Postgres types exactly. Do not add computed fields here.

export type UserRole = 'owner' | 'buyer' | 'supervisor' | 'delivery' | 'seller';
export type UnitKind = 'kg' | 'pcs';
export type TripLeg = 'to_warehouse' | 'to_flipkart' | 'return';
export type StockState = 'fresh' | 'local_only';
export type MoveReason = 'purchase_in' | 'transit_loss' | 'packed' | 'graded_out' |
  'return_reject' | 'sold_local' | 'written_off' | 'count_adjust' | 'state_change';
export type CostKind = 'fixed' | 'variable';
export type InboxStatus = 'needs_review' | 'confirmed' | 'rejected';
export type PayMode = 'cash' | 'credit';
export type EntryChannel = 'form' | 'whatsapp' | 'photo' | 'system';
export type SyncStatus = 'pending' | 'synced' | 'failed';

// ---------------------------------------------------------------- Reference data
export interface User {
  id: string;
  name: string;
  role: UserRole;
  language: 'hi' | 'en';
  active: boolean;
}

export interface Product {
  id: string;
  name_en: string;
  name_hi: string | null;
  unit: UnitKind;
  avg_weight_kg: number | null;
  max_fresh_days: number;
  extra_pct_override: number | null;
  active: boolean;
}

export interface Sku {
  id: string;
  product_id: string;
  label: string;
  base_qty_per_pack: number;
  active: boolean;
}

export interface FlipkartRate {
  id: string;
  sku_id: string;
  rate_paise: number;
  valid_from: string; // date
  valid_to: string | null; // date
}

export interface Mandi {
  id: string;
  name: string;
}

export interface CostType {
  id: string;
  name: string;
  kind: CostKind;
}

export interface KgEstimate {
  month: string; // date
  kg: number;
}

// ---------------------------------------------------------------- Ledger headers
export interface Order {
  id: string;
  delivery_date: string;
  media_id: string | null;
  event_at: string;
  entered_at: string;
  biz_date: string;
  entered_by: string;
  channel: EntryChannel;
  device_id: string | null;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface OrderLine {
  id: string;
  order_id: string;
  sku_id: string;
  packs_ordered: number;
}

export interface Purchase {
  id: string;
  product_id: string;
  lot_id: string;
  mandi_id: string | null;
  qty: number;
  rate_paise: number;
  event_at: string;
  entered_at: string;
  biz_date: string;
  entered_by: string;
  channel: EntryChannel;
  device_id: string | null;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface Lot {
  id: string;
  product_id: string;
  lot_date: string;
  kind: 'purchase' | 'return';
  unit_cost_override_paise: number | null;
  created_at: string;
}

export interface Trip {
  id: string;
  leg: TripLeg;
  driver_name: string | null;
  vehicle_note: string | null;
  event_at: string;
  entered_at: string;
  biz_date: string;
  entered_by: string;
  channel: EntryChannel;
  device_id: string | null;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface TripLine {
  id: string;
  trip_id: string;
  product_id: string;
  lot_id: string | null;
  sku_id: string | null;
  qty_sent: number;
  unit: 'kg' | 'pcs' | 'packs';
}

export interface TripReceipt {
  id: string;
  trip_id: string;
  event_at: string;
  entered_at: string;
  biz_date: string;
  entered_by: string;
  channel: EntryChannel;
  device_id: string | null;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface TripReceiptLine {
  id: string;
  receipt_id: string;
  trip_line_id: string;
  qty_received: number;
}

export interface PackRun {
  id: string;
  sku_id: string;
  packs_made: number;
  event_at: string;
  entered_at: string;
  biz_date: string;
  entered_by: string;
  channel: EntryChannel;
  device_id: string | null;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface PackRunLot {
  id: string;
  pack_run_id: string;
  lot_id: string;
  qty_packed: number;
  qty_graded_out: number;
}

export interface DeliveryNote {
  id: string;
  delivery_date: string;
  flipkart_ref: string | null;
  status: 'draft' | 'confirmed';
  media_id: string | null;
  event_at: string;
  entered_at: string;
  biz_date: string;
  entered_by: string;
  channel: EntryChannel;
  device_id: string | null;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface DeliveryNoteLine {
  id: string;
  note_id: string;
  sku_id: string;
  printed_qty: number;
  accepted_qty: number;
  reason: string | null;
}

export interface StockCount {
  id: string;
  event_at: string;
  entered_at: string;
  biz_date: string;
  entered_by: string;
  channel: EntryChannel;
  device_id: string | null;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface StockCountLine {
  id: string;
  count_id: string;
  lot_id: string;
  fresh_qty: number;
  local_only_qty: number;
  write_off_qty: number;
}

export interface LocalSale {
  id: string;
  product_id: string;
  lot_id: string;
  from_state: StockState;
  qty: number;
  rate_paise: number;
  amount_paise: number;
  pay_mode: PayMode;
  event_at: string;
  entered_at: string;
  biz_date: string;
  entered_by: string;
  channel: EntryChannel;
  device_id: string | null;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface Cost {
  id: string;
  cost_type_id: string;
  amount_paise: number;
  trip_id: string | null;
  product_id: string | null;
  event_at: string;
  entered_at: string;
  biz_date: string;
  entered_by: string;
  channel: EntryChannel;
  device_id: string | null;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface Payment {
  id: string;
  amount_paise: number;
  source: string;
  reference: string | null;
  event_at: string;
  entered_at: string;
  biz_date: string;
  entered_by: string;
  channel: EntryChannel;
  device_id: string | null;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface Deduction {
  id: string;
  payment_id: string;
  type: string;
  amount_paise: number;
  note: string | null;
}

// ---------------------------------------------------------------- View types
export interface BuyingPlanRow {
  product_id: string;
  name_en: string;
  unit: UnitKind;
  order_qty: number;
  extra_pct: number;
  learned_extra_pct: number | null;
  too_high: boolean;
  fresh_stock: number;
  qty_to_buy: number;
}

export interface CountDefaultRow {
  product_id: string;
  lot_id: string;
  lot_date: string;
  expected_qty: number;
  default_fresh: number;
  default_local_only: number;
}

export interface StockOnHandRow {
  product_id: string;
  lot_id: string;
  lot_date: string;
  kind: 'purchase' | 'return';
  state: StockState;
  qty: number;
  value_paise: number;
}

export interface FillRateDailyRow {
  biz_date: string;
  ordered_packs: number;
  accepted_packs: number;
  fill_rate: number;
}

export interface LotCostRow {
  lot_id: string;
  product_id: string;
  lot_date: string;
  kind: 'purchase' | 'return';
  qty_bought: number;
  amount_paise: number;
  unit_cost_paise: number;
}

export interface FlipkartDailyRow {
  biz_date: string;
  product_id: string;
  sku_id: string;
  printed_qty: number;
  accepted_qty: number;
  rate_paise: number;
  revenue_paise: number;
  cogs_paise: number;
  rate_missing: boolean;
  cost_missing: boolean;
}

export interface CashDailyRow {
  biz_date: string;
  cash_out_paise: number;
  cash_in_paise: number;
}

export interface FlipkartReceivableRow {
  billed_paise: number;
  received_paise: number;
  deducted_paise: number;
  owed_paise: number;
}

export interface ProfitDailyRow {
  biz_date: string;
  revenue_flipkart_paise: number;
  revenue_local_paise: number;
  cogs_flipkart_paise: number;
  cogs_local_paise: number;
  losses_paise: number;
  giveaway_paise: number;
  variable_costs_allocated_paise: number;
  variable_costs_unallocated_paise: number;
  fixed_costs_paise: number;
  flipkart_deductions_paise: number;
  profit_paise: number;
}

export interface LossesValuedRow {
  product_id: string;
  biz_date: string;
  reason: MoveReason;
  qty_lost: number;
  value_paise: number;
}

export interface GiveawayDailyRow {
  product_id: string;
  biz_date: string;
  qty: number;
  value_paise: number;
}

// ---------------------------------------------------------------- Photo reading
export interface DeliveryNotePhotoResult {
  date: string | null;
  printedTotal: number;
  rows: DeliveryNotePhotoRow[];
}

export interface DeliveryNotePhotoRow {
  product: string;
  pack: string;
  printed: number;
  handwritten: number | null;
  ticked: boolean;
  uncertain: boolean;
}
