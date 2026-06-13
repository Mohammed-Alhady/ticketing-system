export type Role = 'admin' | 'employee'
export type Currency = 'LYD' | 'USD' | 'EUR'
export type ServiceType = 'ticket' | 'visa' | 'hotel' | 'transport' | 'other'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'other'

export type Profile = {
  id: string
  full_name: string
  role: Role
  created_at?: string
  updated_at?: string
}

export type Customer = {
  id: string
  name: string
  phone?: string | null
  passport_number?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
}

export type Supplier = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  service_category?: string | null
  address?: string | null
  notes?: string | null
}

export type Service = {
  id: string
  name: string
  type: ServiceType
  description?: string | null
  is_active: boolean
}

export type Transaction = {
  id: string
  customer_id?: string | null
  guest_customer_name?: string | null
  guest_customer_phone?: string | null
  guest_customer_notes?: string | null
  supplier_id: string
  service_id: string
  transaction_date: string
  issue_date?: string | null
  supplier_cost: number
  customer_price: number
  profit?: number
  currency: Currency
  status: 'active' | 'cancelled' | 'completed'
  notes?: string | null
  ticket_number?: string | null
  pnr?: string | null
  route_segments?: unknown
  departure_date?: string | null
  departure_time?: string | null
  return_date?: string | null
  return_time?: string | null
  employee_id?: string | null
  created_by?: string | null
  created_at?: string
}

export type TransactionSummary = {
  transaction_id: string
  transaction_date: string
  issue_date?: string | null
  customer_id?: string | null
  customer_name: string
  customer_phone?: string | null
  guest_customer_name?: string | null
  guest_customer_phone?: string | null
  guest_customer_notes?: string | null
  customer_type?: 'saved' | 'guest'
  supplier_id: string
  supplier_name: string
  service_id: string
  service_name: string
  service_type: ServiceType
  supplier_cost: number
  customer_price: number
  expected_profit: number
  currency: Currency
  ticket_number?: string | null
  pnr?: string | null
  route_segments?: unknown
  departure_date?: string | null
  departure_time?: string | null
  return_date?: string | null
  return_time?: string | null
  total_customer_paid: number
  customer_remaining: number
  total_supplier_paid: number
  supplier_remaining: number
  actual_cash_profit: number
  status: string
  employee_id?: string | null
  employee_name?: string | null
  created_by?: string | null
  created_by_name?: string | null
  created_at?: string
}

export type AccountEntryType =
  | 'transaction_charge'
  | 'transaction_cost'
  | 'payment'
  | 'opening_balance'
  | 'manual_debt'
  | 'manual_credit'
  | 'adjustment'
export type AccountDirection = 'debit' | 'credit'

export type CustomerAccountEntry = {
  id: string
  customer_id: string
  entry_date: string
  entry_type: AccountEntryType
  direction: AccountDirection
  amount: number
  currency: Currency
  description?: string | null
  transaction_id?: string | null
  created_by?: string | null
  created_at?: string
  customers?: Pick<Customer, 'name'> | null
  profiles?: Pick<Profile, 'full_name'> | null
  transactions?: { id: string; transaction_date: string } | null
}

export type SupplierAccountEntry = {
  id: string
  supplier_id: string
  entry_date: string
  entry_type: AccountEntryType
  direction: AccountDirection
  amount: number
  currency: Currency
  description?: string | null
  transaction_id?: string | null
  created_by?: string | null
  created_at?: string
  suppliers?: Pick<Supplier, 'name'> | null
  profiles?: Pick<Profile, 'full_name'> | null
  transactions?: { id: string; transaction_date: string } | null
}

export type CustomerBalance = {
  customer_id: string
  customer_name: string
  currency: Currency
  balance: number
}

export type SupplierBalance = {
  supplier_id: string
  supplier_name: string
  currency: Currency
  balance: number
}

export type TransactionReportRow = {
  transaction_id: string
  transaction_date: string
  customer_id?: string | null
  customer_name: string
  customer_phone?: string | null
  guest_customer_name?: string | null
  guest_customer_phone?: string | null
  guest_customer_notes?: string | null
  customer_type?: 'saved' | 'guest'
  supplier_id: string
  supplier_name: string
  service_id: string
  service_name: string
  service_type: ServiceType
  supplier_cost: number
  customer_price: number
  expected_profit: number
  currency: Currency
  ticket_number?: string | null
  pnr?: string | null
  route_segments?: unknown
  departure_date?: string | null
  departure_time?: string | null
  return_date?: string | null
  return_time?: string | null
  employee_id?: string | null
  employee_name?: string | null
  created_by?: string | null
  created_by_name?: string | null
  created_at?: string
  status: string
}
