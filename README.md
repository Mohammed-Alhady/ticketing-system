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

## Current Business Rules

- One-time customer transactions are linked to the saved customer account `عملاء لمرة واحدة`.
- The real guest name, phone, and notes remain stored on each transaction for ticket reference and WhatsApp messages.
- Deleting a transaction cascades linked customer and supplier ledger rows for that transaction. Manual account entries keep `transaction_id = null` and are not affected.
- Ticket route segments can store `from`, `to`, `departure_date`, and `departure_time` per segment. The global departure date/time stays populated from the first segment for reports and upcoming-flight filters.
- Report filters open in a large popup/modal; the main reports page focuses on the title, summaries, and results table.

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

## One-Time Customers

Transactions can use either a saved customer or a one-time guest customer:

- Saved customer: `transactions.customer_id` references `customers(id)`.
- Guest customer: `guest_customer_name`, `guest_customer_phone`, and `guest_customer_notes` are stored directly on the transaction.
- The database requires either `customer_id` or `guest_customer_name`.
- Guest customers are not inserted into the `customers` table.
- Guest customer transactions appear in transaction lists, reports, dashboard tables, and upcoming flights.
- Guest customer transactions do not create `customer_account_entries`, so they do not appear in saved customer account statements.
- Supplier ledger entries are still created normally.

## Ticket Fields

Ticket transactions can store extra ticket details:

- `ticket_number`
- `pnr`
- `route_segments`
- `departure_date`
- `departure_time`
- `return_date`
- `return_time`

`route_segments` is stored as a JSON array and can contain one or more route legs:

```json
[
  { "from": "Tripoli", "to": "Istanbul" },
  { "from": "Istanbul", "to": "Cairo" }
]
```

The UI shows ticket fields only when the selected service type is `ticket`. Route summaries are displayed as `Tripoli → Istanbul → Cairo`.

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
- Upcoming departure count.
- Upcoming return count.
- Nearest 5 upcoming ticket flights.

Money values are never mixed across currencies; LYD, USD, and EUR totals are displayed separately.

Positive financial values are shown in green, negative values in red, and zero/default values in the normal text color. The app uses a shared `AmountText` component for this behavior.

## Upcoming Flights

The `/upcoming-flights` page lists ticket transactions with upcoming departure or return dates.

Filters include:

- Upcoming departures.
- Upcoming returns.
- Today.
- Next 7 days.
- Next 30 days.
- Customer or guest customer name.
- PNR.
- Ticket number.

The table shows customer name, phone, route summary, ticket number, PNR, departure and return timing, supplier, employee, and message actions.

## Ticket Messages

Ticket rows can generate an Arabic customer message from ticket data. The message preview includes available fields only:

- Customer or guest customer name.
- Route summary.
- Ticket number.
- PNR.
- Departure date/time.
- Return date/time.

Actions:

- `نسخ الرسالة` copies the message to the clipboard.
- `فتح واتساب` appears when a saved or guest customer phone exists.

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

- Accordion report categories with one active report panel.
- Report-specific filters and explicit `بحث` buttons.
- Empty and loading states.
- Total cards above result tables.
- Separate currency totals; LYD, USD, and EUR are never mixed.

Report categories:

- `تقارير العملاء`: كشف حساب عميل، ديون العملاء، معاملات عميل.
- `تقارير الموردين`: كشف حساب مورد، ديون الموردين، معاملات مورد.
- `تقارير الإصدارات / المعاملات`: كشف المعاملات، إصدارات حسب الموظف، إصدارات حسب المورد، إصدارات حسب الخدمة.
- `تقارير الرحلات`: الرحلات القادمة، رحلات العودة القادمة، تذاكر بدون موعد رحلة.
- `تقارير الأرباح والمالية`: إجمالي الأرباح، ملخص مالي، الحركات المالية اليدوية.
- `تقارير الموظفين`: أداء الموظفين، معاملات موظف.

Filters vary by report and include date ranges, currency, customer, supplier, service, employee, creator, ticket number, PNR, saved/guest customer type, account entry type, and debit/credit direction.

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

`20260613020000_guest_customers_and_ticket_fields.sql` adds guest customers and ticket metadata. It:

- Makes `transactions.customer_id` nullable.
- Adds guest customer fields.
- Adds ticket number, PNR, route segments, departure, and return fields.
- Enforces that each transaction has either a saved customer or a guest customer name.
- Adds indexes for ticket number, PNR, departure date, return date, and guest customer name.
- Updates transaction report and summary views for guest customers and ticket fields.
- Updates the transaction ledger trigger so guest customer transactions do not create customer account entries.

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
