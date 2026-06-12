# Travel Services Management System - Technical Design

This document is the root project specification for the travel services management system.

## Project Overview

Build a simple web application for managing travel-related services such as flight tickets, visas, hotel bookings, transport, and other services.

Stack:

- React + Vite + TypeScript
- Supabase Auth
- Supabase PostgreSQL
- Supabase Row Level Security
- Netlify deployment

The system records transactions between customers and suppliers, tracks customer debts, supplier payables, expected profit, actual cash profit, and totals by currency.

## Core Flow

A customer buys a travel service from the business. The business obtains that service from a supplier. Each transaction records:

- Customer
- Supplier
- Service
- Supplier cost
- Customer price
- Expected profit
- Customer payments
- Supplier payments
- Remaining customer debt
- Remaining supplier payable

## Roles

Admin:

- Manage users/profiles.
- Manage customers, suppliers, services, and transactions.
- Add customer and supplier payments.
- View reports.
- Edit and delete records.

Employee:

- View records.
- Create services.
- Create transactions.
- Add payments.
- Cannot manage users.
- Cannot edit/delete transactions.
- Cannot delete records.

UI checks are not enough. Supabase RLS is the real permission boundary.

## Tables

Required tables:

- `profiles`
- `customers`
- `suppliers`
- `services`
- `transactions`
- `customer_payments`
- `supplier_payments`

## Financial Calculations

- `customer_price = supplier_cost + profit`
- `customer_remaining = customer_price - total_customer_payments`
- `supplier_remaining = supplier_cost - total_supplier_payments`
- `expected_profit = customer_price - supplier_cost`
- `actual_profit = total_customer_payments - total_supplier_payments`

## Recommended View

Create `transaction_summary` with transaction details, related customer/supplier/service names, totals paid, remaining debts, expected profit, and actual cash profit.

## Pages

Minimum pages:

- `/login`
- `/dashboard`
- `/customers`
- `/suppliers`
- `/services`
- `/transactions`
- `/customer-payments`
- `/supplier-payments`
- `/reports`
- `/users` for admins

## UI Requirements

- Arabic UI preferred.
- RTL-friendly.
- Responsive layout.
- Loading and error states.
- Confirmation modal before deletes.
- Employees should not see edit/delete buttons.

## Supabase Requirements

Migrations live in `supabase/migrations/` and include:

- Table creation.
- Foreign keys.
- Indexes.
- Default timestamps.
- RLS enablement.
- Admin and employee policies.
- Helper functions:
  - `get_current_user_role()`
  - `is_admin()`
  - `is_employee()`

## Deployment

Deploy to Netlify using:

- Build command: `npm run build`
- Publish directory: `dist`

Required Netlify environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
