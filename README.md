# Travel Services Management System

Arabic RTL React application for managing travel services: tickets, visas, hotels, transport, suppliers, customers, transactions, account ledgers, and financial reports.

## Tech Stack

- React + Vite + TypeScript
- Supabase Auth
- Supabase PostgreSQL
- Supabase Row Level Security
- Netlify deployment

## Setup

```bash
npm install
npm run dev
```

Create `.env` in the project root using:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Do not use `VITE_SUPABASE_ANON_KEY`; the app reads `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Supabase Setup

1. Create a Supabase project.
2. Enable email/password authentication in Authentication settings.
3. Run the migrations in order from `supabase/migrations`.
4. Create the first user from Supabase Auth or the app login flow.
5. Promote the first user to admin from Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin', full_name = 'Admin'
where id = 'AUTH_USER_ID';
```

New users are created as `employee` by default through the `handle_new_user()` trigger.

## Database

Required tables:

- `profiles`
- `customers`
- `suppliers`
- `services`
- `transactions`
- `customer_account_entries`
- `supplier_account_entries`

Legacy tables `customer_payments` and `supplier_payments` may still exist for backward compatibility, but the UI now uses account entries instead of transaction-based payments.

## Manual Account Entries and Account-Based Payments

Payments and manual balances are recorded on the customer or supplier account ledger. An account entry may be linked to a transaction, or it may be a standalone manual entry with `transaction_id = null`.

`customer_account_entries` stores:

- Customer transaction charges.
- Customer payments.
- Customer opening balances.
- Customer manual debts.
- Customer manual credits and negative receipts.
- Customer balance adjustments.
- Optional `transaction_id` when an entry is linked to a transaction.
- `direction`, which controls the accounting effect.
- `created_by` profile for audit/reporting.

`supplier_account_entries` stores:

- Supplier transaction costs.
- Supplier payments.
- Supplier opening balances.
- Supplier manual debts.
- Supplier manual credits and negative receipts.
- Supplier balance adjustments.
- Optional `transaction_id` when an entry is linked to a transaction.
- `direction`, which controls the accounting effect.
- `created_by` profile for audit/reporting.

When a transaction is created, the database trigger creates:

- A `customer_account_entries` row with `entry_type = transaction_charge` and `direction = debit`.
- A `supplier_account_entries` row with `entry_type = transaction_cost` and `direction = debit`.

When a payment is added:

- Customer payment: `entry_type = payment`, `direction = credit`.
- Supplier payment: `entry_type = payment`, `direction = credit`.

Supported customer entry types:

- `transaction_charge`
- `payment`
- `opening_balance`
- `manual_debt`
- `manual_credit`
- `adjustment`

Supported supplier entry types:

- `transaction_cost`
- `payment`
- `opening_balance`
- `manual_debt`
- `manual_credit`
- `adjustment`

Direction rules:

- `debit` increases the account balance.
- `credit` decreases the account balance.
- For customers, debit increases what the customer owes us and credit decreases what the customer owes us.
- For suppliers, debit increases what we owe the supplier and credit decreases what we owe the supplier.

Balances:

- Customer balance = total debit - total credit.
- Supplier balance = total debit - total credit.
- Balances are grouped by currency in `customer_balances_by_currency` and `supplier_balances_by_currency`.

Examples:

```sql
-- Customer opening balance owed by the customer
insert into customer_account_entries
  (customer_id, entry_type, direction, amount, currency, transaction_id, description)
values
  ('CUSTOMER_ID', 'opening_balance', 'debit', 1000, 'LYD', null, 'رصيد افتتاحي مستحق على العميل');

-- Customer manual credit / negative receipt
insert into customer_account_entries
  (customer_id, entry_type, direction, amount, currency, transaction_id, description)
values
  ('CUSTOMER_ID', 'manual_credit', 'credit', 200, 'LYD', null, 'خصم أو تسوية لصالح العميل');

-- Supplier opening balance owed to the supplier
insert into supplier_account_entries
  (supplier_id, entry_type, direction, amount, currency, transaction_id, description)
values
  ('SUPPLIER_ID', 'opening_balance', 'debit', 1500, 'LYD', null, 'رصيد افتتاحي مستحق للمورد');

-- Supplier manual debt without a transaction
insert into supplier_account_entries
  (supplier_id, entry_type, direction, amount, currency, transaction_id, description)
values
  ('SUPPLIER_ID', 'manual_debt', 'debit', 400, 'LYD', null, 'مبلغ مستحق للمورد بدون معاملة');
```

The migration also creates:

- `transaction_summary` view for dashboard compatibility.
- `transaction_report_view` for transaction reports.
- `customer_balances_by_currency` and `supplier_balances_by_currency` views.
- `get_current_user_role()`, `is_admin()`, and `is_employee()` helper functions.
- Timestamp triggers for `updated_at`.
- Indexes for common foreign keys and date filters.
- RLS policies for admin and employee access.

## Permissions

Admins can manage users/profiles, customers, suppliers, services, transactions, account entries, and reports. Admins can assign or filter by any transaction employee.

Employees can:

- View records.
- Create services.
- Create transactions.
- Add customer and supplier account entries/payments.

Employees cannot:

- Manage users.
- Edit/delete transactions.
- Change `employee_id` to another user.
- Delete records.
- Manage customers or suppliers.

The React UI hides unauthorized actions, and Supabase RLS enforces the same restrictions at the database layer.

## Reports

## Dashboard

The dashboard reads live Supabase data and shows:

- Total transactions, customers, suppliers, and services.
- Customer debts grouped by currency.
- Supplier debts grouped by currency.
- Expected profit for the current month grouped by currency.
- Actual profit for the current month grouped by currency.
- Current-month transaction count.
- Latest 5 transactions.

Money values are never mixed across currencies; LYD, USD, and EUR totals are displayed separately.

## UI Behavior

Create/edit forms open in popup modals for:

- Customers.
- Suppliers.
- Services.
- Transactions.
- Customer account entries.
- Supplier account entries.

After saving, the modal closes and the list refreshes. Admin-only edit/delete actions remain hidden from employee users, and Supabase RLS still enforces permissions.

## Reports

The reports page includes:

- Customer account statement with a required customer selection before loading the table.
- Supplier account statement with a required supplier selection before loading the table.
- Total customer debts grouped by customer and currency.
- Total supplier debts grouped by supplier and currency.
- Total profits grouped by currency with date, currency, and employee filters.
- Transactions report by date, customer, supplier, service, currency, employee, and creator.

Customer and supplier statements show:

- Total debit.
- Total credit.
- Final balance.
- Running balance per row.

The transactions report does not load unfiltered data. Select at least one filter or a date range, then click `بحث`. Use `مسح الفلاتر` to reset the report.

Calculations:

- `customer_balance = sum(case when direction = 'debit' then amount else 0 end) - sum(case when direction = 'credit' then amount else 0 end)`
- `supplier_balance = sum(case when direction = 'debit' then amount else 0 end) - sum(case when direction = 'credit' then amount else 0 end)`
- `expected_profit = customer_price - supplier_cost`
- `actual_profit = total customer payments - total supplier payments`

Transactions include `employee_id`, which defaults to the logged-in profile. Admin users can select another employee from the transaction form; employee users always use their own profile id.

## Migration Notes

For an existing database, run `20260612214500_account_ledgers_and_employee_transactions.sql` after the initial migration. It:

- Adds `employee_id` to `transactions`.
- Creates customer and supplier account entry tables.
- Backfills transaction charge/cost entries for existing transactions.
- Adds triggers for new transaction ledger entries.
- Adds report/balance views and indexes.
- Enables RLS and policies for the new ledger tables.

`20260613003000_clear_business_data_only.sql` clears business/demo data only and intentionally preserves `auth.users` and `profiles`. It deletes, in order:

- `customer_account_entries`
- `supplier_account_entries`
- `customer_payments`
- `supplier_payments`
- `transactions`
- `services`
- `customers`
- `suppliers`

Run this cleanup migration only when you want to empty operational data while keeping user accounts.

`20260613010000_manual_account_entry_directions.sql` adds manual-account-entry support. It:

- Adds `direction` to customer and supplier account entries.
- Backfills existing directions from existing entry types.
- Allows opening balances, manual debts, manual credits, and adjustments.
- Keeps `transaction_id` nullable for standalone entries.
- Updates balance and transaction summary views to use debit minus credit.
- Updates transaction ledger triggers to create debit entries.
- Enforces positive amounts, allowed entry types, allowed directions, and current-user `created_by` handling.

To push new migrations from this project:

```bash
npm run resetdb
```

## Netlify Deployment

1. Push the project to GitHub.
2. Create a new Netlify site from the repository.
3. Use these build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Add environment variables in Netlify Site configuration:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Deploy.

`netlify.toml` is included with the same build settings and SPA redirect rule.
