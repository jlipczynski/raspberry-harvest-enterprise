export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export type DeliveryStatus = "open" | "closed";

export interface Delivery {
  id: string;
  delivery_date: string; // YYYY-MM-DD
  note: string | null;
  status: DeliveryStatus;
  created_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  delivery_id: string;
  kg_second: number;
  kg_premium: number;
  delivered: boolean;
  notes: string | null;
  created_at: string;
}

export interface OrderWithCustomer extends Order {
  customer: Customer | null;
  amount: number; // liczone z settings, nie zapisywane w bazie
}

export interface Prices {
  price_second: number;
  price_premium: number;
}

/** Podsumowanie jednej dostawy — wszystko liczone na bieżąco z settings. */
export interface DeliverySummary {
  delivery: Delivery;
  orders_count: number;
  kg_second: number;
  kg_premium: number;
  amount_ordered: number;
  delivered_count: number;
  amount_delivered: number;
  kg_delivered: number;
}
