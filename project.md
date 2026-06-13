# Travel Services Management System

## Overview

This project is an Arabic RTL web application for managing travel services such as tickets, visas, hotels, transport, customers, suppliers, transactions, account ledgers, payments, reports, and upcoming flight reminders.

The system is built as a React + Vite + TypeScript frontend connected to Supabase for authentication, PostgreSQL database storage, views, triggers, and Row Level Security.

The app supports two main user roles:

- `admin`: full management access.
- `employee`: operational creation and viewing access according to business rules.

## Technology Stack

- React
- Vite
- TypeScript
- Supabase Auth
- Supabase PostgreSQL
- Supabase Row Level Security
- Supabase database migrations
- Netlify-ready frontend deployment

## Main Modules

### Authentication

Users sign in through Supabase Auth.

Each authenticated user has a related row in `profiles`.

Profiles store:

- Full name
- Role: `admin` or `employee`
- Audit timestamps

New users are created as employees by default through the database trigger.

### Customers

The system supports permanent saved customers.

Customer records can include:

- Name
- Phone
- Passport number
- Email
- Address
- Notes

Saved customers can have account statements and ledger balances.

### One-Time / Guest Customers

Transactions can also be created for one-time customers without adding them to the permanent customers table.

A transaction can use either:

- `customer_id` for a saved customer
- `guest_customer_name` for a temporary customer

Optional guest fields:

- `guest_customer_phone`
- `guest_customer_notes`

Guest customer rules:

- Guest customers are stored only on the transaction.
- No customer record is created.
- Guest transactions appear in transaction lists and reports.
- Guest transactions do not create customer ledger entries.
- Supplier ledger entries are still created normally.

### Suppliers

Suppliers are permanent records used for service providers.

Supplier records can include:

- Name
- Phone
- Email
- Service category
- Address
- Notes

Suppliers have account statements and ledger balances.

### Services

Services define the type of travel product being sold.

Supported service types:

- Ticket
- Visa
- Hotel
- Transport
- Other

Ticket services unlock extra ticket-specific fields in the transaction form.

### Transactions

Transactions are the core business records.

A transaction includes:

- Customer or guest customer
- Supplier
- Service
- Transaction date
- Issue date
- Supplier cost
- Customer price
- Currency
- Expected profit
- Employee
- Creator
- Status
- Notes

Expected profit is calculated as:

```text
customer_price - supplier_cost
```

When a transaction is created:

- If it has a saved customer, a customer account debit is created.
- A supplier account debit is always created.
- Guest customer transactions do not create customer account entries.

### Ticket Fields

Ticket transactions can include:

- Ticket number
- PNR
- Route segments
- Departure date
- Departure time
- Return date
- Return time

Route segments are stored as JSON.

Example:

```json
[
  { "from": "Tripoli", "to": "Istanbul" },
  { "from": "Istanbul", "to": "Cairo" }
]
```

The UI displays a route summary such as:

```text
Tripoli → Istanbul → Cairo
```

### Ticket Messages

Ticket rows can generate an Arabic message for the customer.

The message can include:

- Customer or guest customer name
- Ticket number
- PNR
- Route summary
- Departure date and time
- Return date and time

Actions:

- Copy message to clipboard
- Open WhatsApp when a phone number exists

No paid SMS or WhatsApp API is integrated.

### Upcoming Flights

The `/upcoming-flights` page shows upcoming ticket-related travel.

It supports:

- Upcoming departures
- Upcoming returns
- Today
- Next 7 days
- Next 30 days
- Customer or guest search
- Ticket number
- PNR

The dashboard also shows:

- Upcoming departure count
- Upcoming return count
- Nearest upcoming flights

## Account Ledger System

The system uses account ledger tables:

- `customer_account_entries`
- `supplier_account_entries`

These tables support:

- Transaction charges
- Transaction costs
- Payments
- Opening balances
- Manual debts
- Manual credits
- Adjustments
- Negative receipts / reverse entries

### Entry Types

Customer account entry types:

- `transaction_charge`
- `payment`
- `opening_balance`
- `manual_debt`
- `manual_credit`
- `adjustment`

Supplier account entry types:

- `transaction_cost`
- `payment`
- `opening_balance`
- `manual_debt`
- `manual_credit`
- `adjustment`

### Debit and Credit Direction

Every ledger entry has a `direction`.

Allowed values:

- `debit`
- `credit`

For customers:

- Debit increases what the customer owes.
- Credit decreases what the customer owes.

For suppliers:

- Debit increases what the business owes the supplier.
- Credit decreases what the business owes the supplier.

Balance is always calculated as:

```sql
sum(case when direction = 'debit' then amount else 0 end)
-
sum(case when direction = 'credit' then amount else 0 end)
```

The system does not rely only on `entry_type` to calculate balances.

## Payments

Payments are stored as ledger entries, not only in legacy payment tables.

Customer payment:

- `entry_type = payment`
- `direction = credit`

Supplier payment:

- `entry_type = payment`
- `direction = credit`

Payments may optionally be linked to a transaction.

Manual standalone entries can have `transaction_id = null`.

## Reports

The reports module uses a modern tab-based Arabic RTL interface.

Main report tabs:

- العملاء
- الموردون
- المالية
- الرحلات
- الموظفون

Each tab contains sub-tabs and does not load heavy data automatically. Reports run only after pressing `بحث`.

Each report provides:

- Filter card
- Search button
- Reset filters button
- Export placeholder
- Loading state
- Empty state
- Summary cards
- Results table

### Customer Reports

Sub-tabs:

- كشف حساب
- الديون
- معاملات العميل

Customer account statement shows:

- Date
- Description
- Debit
- Credit
- Running balance
- Currency
- Created by

### Supplier Reports

Sub-tabs:

- كشف الحساب
- الديون
- معاملات المورد

Supplier account statement follows the same debit, credit, and balance rules.

### Financial Reports

Sub-tabs:

- الأرباح
- الملخص المالي
- الحركات اليدوية

Financial reports show:

- Expected profit
- Actual profit
- Transaction count
- Customer debts
- Supplier debts
- Manual financial movements

Currency totals are grouped separately. LYD, USD, and EUR are never mixed.

### Flight Reports

Sub-tabs:

- الرحلات القادمة
- رحلات العودة
- جميع التذاكر

Flight reports show:

- Customer
- Phone
- Route
- Ticket number
- PNR
- Departure date
- Return date
- Supplier
- Employee
- Message action

### Employee Reports

Sub-tabs:

- الأداء
- المعاملات

Employee performance reports show:

- Transaction count
- Supplier cost
- Customer price
- Expected profit
- Grouping by employee and currency

## Dashboard

The dashboard shows:

- Total transactions
- Total customers
- Total suppliers
- Total services
- Customer debts by currency
- Supplier debts by currency
- Expected profit for the current month
- Actual profit for the current month
- Current-month transaction count
- Upcoming departure count
- Upcoming return count
- Latest transactions
- Nearest upcoming flights

## UI and Theme

The UI is Arabic RTL.

The current visual palette uses:

- Primary blue: `#0057D9`
- Primary hover: `#0047B3`
- Primary light: `#E8F1FF`
- Secondary teal: `#00A3A3`
- Accent orange: `#F59E0B`
- Background: `#F6F8FB`
- Surface: `#FFFFFF`
- Sidebar: `#112240`
- Text primary: `#1E293B`
- Text secondary: `#64748B`
- Border: `#E2E8F0`

Financial colors:

- Positive: green `#16A34A`
- Negative: red `#DC2626`
- Zero: gray `#64748B`

Tables include:

- Sticky headers
- Hover effect
- Alternating row colors
- Compact spacing
- Rounded responsive wrappers

## Reusable Frontend Components

Important reusable components include:

- `AmountText`: displays money with positive, negative, or zero coloring.
- `DashboardCard`: dashboard metric card with visual variants.
- `DataTable`: shared responsive table component.
- `FormModal`: shared modal wrapper.
- `ConfirmModal`: shared confirmation modal.
- `ReportTabs`: reports main tabs and sub-tabs.
- `ReportFilters`: report filter card.
- `SummaryCards`: report total cards.
- `ReportTable`: report results table wrapper.

## Database Objects

Main tables:

- `profiles`
- `customers`
- `suppliers`
- `services`
- `transactions`
- `customer_account_entries`
- `supplier_account_entries`

Legacy tables may still exist:

- `customer_payments`
- `supplier_payments`

Main views:

- `transaction_report_view`
- `transaction_summary`
- `customer_balances_by_currency`
- `supplier_balances_by_currency`

Main helper functions:

- `get_current_user_role()`
- `is_admin()`
- `is_employee()`
- `create_transaction_account_entries()`
- `set_transaction_employee()`
- `set_account_entry_created_by()`

## Permissions

Admins can:

- Manage users
- Manage customers
- Manage suppliers
- Manage services
- Manage transactions
- Manage account entries
- View all reports

Employees can:

- View operational records
- Create services
- Create transactions
- Add account entries when allowed by business rules
- View reports

Employees cannot:

- Manage users
- Edit or delete old records
- Change `created_by`
- Change ownership fields outside allowed rules

Supabase RLS enforces these permissions at the database level.

## Migrations

The project uses Supabase SQL migrations in `supabase/migrations`.

Important migration areas:

- Initial schema and RLS setup.
- Account ledger tables and transaction ledger triggers.
- Manual account entries and debit/credit direction.
- Guest customer support.
- Ticket fields and route segments.
- Report and summary views.

## Build and Deployment

Development:

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

The app is Netlify-ready with:

- Build command: `npm run build`
- Publish directory: `dist`

Required environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Design Principles

The system is designed to:

- Keep permanent customers separate from one-time guests.
- Use ledger entries as the accounting source of truth.
- Keep balances based on debit and credit direction.
- Avoid mixing currencies in reports.
- Keep Arabic RTL workflows clear and operational.
- Provide searchable reports without loading heavy data automatically.
- Support travel-specific ticket tracking and customer reminders.
