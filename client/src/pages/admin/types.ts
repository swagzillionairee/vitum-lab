// Shared types for the admin dashboard and its tab components.

export interface InventoryRow {
  cart_code: string;
  stock: number;
  is_active: boolean;
  updated_at: string;
}

export interface OrderItem {
  name: string;
  dose: string;
  quantity: number;
  cartCode: string;
  price: number;
}

export interface ShippingAddress {
  name?: string; line1?: string; line2?: string; city?: string;
  state?: string; postal_code?: string; country?: string; phone?: string;
}

export interface OrderRow {
  id: string;
  email: string;
  net_amount: number;
  gross_amount?: number;
  discount_amount?: number;
  discount_code?: string | null;
  discount_breakdown?: { type: string; label: string; amount: number }[] | null;
  credit_applied?: number | null;
  referral_code?: string | null;
  commission_amount?: number | null;
  status: string;
  created_at: string;
  items?: OrderItem[];
  fulfillment_status?: string;
  tracking_number?: string | null;
  carrier?: string | null;
  cancel_reason?: string | null;
  pay_currency?: string | null;
  pay_amount?: number | null;
  confirmed_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  label_url?: string | null;
  shipping_address?: ShippingAddress | null;
  emails_sent?: Record<string, string> | null;
}

export interface AffiliatePayout { id: string; affiliate_id: string; amount: number; note: string | null; created_at: string }
export interface AffiliateRow {
  id: string;
  email: string;
  code: string;
  name: string | null;
  discount_percent: number;
  commission_percent: number;
  orders: number;
  earned: number;
  paid: number;
  owed: number;
  payouts: AffiliatePayout[];
}

export interface PromoRow {
  id: string;
  code: string;
  percent_off: number;
  min_subtotal: number;
  max_uses: number | null;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SitePromo {
  sitewide_active: boolean;
  sitewide_percent: number | null;
  sitewide_label: string | null;
  sitewide_starts_at: string | null;
  sitewide_ends_at: string | null;
}

export interface QuantityTier {
  min_qty: number;
  percent: number;
}

export interface Variant {
  id: string;
  dose: string;
  lot: string;
  price: number;
  sale_price: number | null;
  sale_ends_at: string | null;
  image_url: string;
  cart_code: string;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  full_name: string;
  category: string;
  tagline: string;
  description: string;
  long_description: string;
  card_bg: string;
  badge: string | null;
  variants: Variant[];
  specs: { label: string; value: string }[];
  storage_instructions: string;
  reconstitution_note: string | null;
  research_notes: string[];
  coa_href: string;
  is_active: boolean;
  display_order: number;
}

export interface CustomerRow {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  provider: string | null;
  orders: number;
  spent: number;
}

export interface ShipmentRow {
  id: string;
  email: string;
  tracking_number: string | null;
  carrier: string | null;
  fulfillment_status: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
}

export interface Summary {
  revenue30: number;
  revenueAll: number;
  paidOrders: number;
  aov: number;
  ordersToFulfill: number;
  pendingPayment: number;
  ordersThisWeek: number;
  lowStock: { cartCode: string; stock: number }[];
  outOfStockCount: number;
  lowStockThreshold: number;
  topProducts: { name: string; dose: string; qty: number; revenue: number }[];
  recentOrders: { status: string; fulfillment_status: string | null; net_amount: number; created_at: string }[];
  dailyRevenue: { date: string; revenue: number }[];
  commissionsOwed: number;
  commissionsByAffiliate: { id: string; name: string; code: string; amount: number; paid: number; owed: number; orders: number }[];
  repeatCustomerRate: number;
  repeatCustomers: number;
  totalCustomers: number;
  cancelled30: number;
  autoExpired30: number;
}
