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

## Account-Based Payments

Payments are recorded on the customer or supplier account, not directly on a transaction.

`customer_account_entries` stores:

- Customer transaction charges.
- Customer payments.
- Customer balance adjustments.
- Optional `transaction_id` when an entry is linked to a transaction.
- `created_by` profile for audit/reporting.

`supplier_account_entries` stores:

- Supplier transaction costs.
- Supplier payments.
- Supplier balance adjustments.
- Optional `transaction_id` when an entry is linked to a transaction.
- `created_by` profile for audit/reporting.

When a transaction is created, the database trigger creates:

- A `customer_account_entries` row with `entry_type = transaction_charge`.
- A `supplier_account_entries` row with `entry_type = transaction_cost`.

Balances:

- Customer balance = charges and positive adjustments minus payments.
- Supplier balance = costs and positive adjustments minus payments.
- Balances are grouped by currency in `customer_balances_by_currency` and `supplier_balances_by_currency`.

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

- `customer_balance = sum(transaction_charge + adjustments) - sum(payments)`
- `supplier_balance = sum(transaction_cost + adjustments) - sum(payments)`
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
