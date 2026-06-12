create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  passport_number text,
  email text,
  address text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  service_category text,
  address text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('ticket', 'visa', 'hotel', 'transport', 'other')),
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  supplier_id uuid not null references public.suppliers(id),
  service_id uuid not null references public.services(id),
  transaction_date date not null default current_date,
  issue_date date,
  supplier_cost numeric(12,2) not null check (supplier_cost >= 0),
  customer_price numeric(12,2) not null check (customer_price >= 0),
  profit numeric(12,2) generated always as (customer_price - supplier_cost) stored,
  currency text not null check (currency in ('LYD', 'USD', 'EUR')),
  customer_payment_status text not null default 'unpaid' check (customer_payment_status in ('unpaid', 'partial', 'paid')),
  supplier_payment_status text not null default 'unpaid' check (supplier_payment_status in ('unpaid', 'partial', 'paid')),
  status text not null default 'active' check (status in ('active', 'cancelled', 'completed')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency in ('LYD', 'USD', 'EUR')),
  payment_date date not null default current_date,
  payment_method text check (payment_method in ('cash', 'bank_transfer', 'card', 'other')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency in ('LYD', 'USD', 'EUR')),
  payment_date date not null default current_date,
  payment_method text check (payment_method in ('cash', 'bank_transfer', 'card', 'other')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists customers_created_by_idx on public.customers(created_by);
create index if not exists suppliers_created_by_idx on public.suppliers(created_by);
create index if not exists services_created_by_idx on public.services(created_by);
create index if not exists transactions_customer_idx on public.transactions(customer_id);
create index if not exists transactions_supplier_idx on public.transactions(supplier_id);
create index if not exists transactions_service_idx on public.transactions(service_id);
create index if not exists transactions_date_idx on public.transactions(transaction_date);
create index if not exists customer_payments_transaction_idx on public.customer_payments(transaction_id);
create index if not exists supplier_payments_transaction_idx on public.supplier_payments(transaction_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();
drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email, 'New user'), 'employee')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.get_current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.get_current_user_role() = 'admin';
$$;

create or replace function public.is_employee()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.get_current_user_role() = 'employee';
$$;

create or replace view public.transaction_summary
with (security_invoker = true)
as
select
  t.id as transaction_id,
  t.transaction_date,
  t.issue_date,
  c.id as customer_id,
  c.name as customer_name,
  s.id as supplier_id,
  s.name as supplier_name,
  sv.id as service_id,
  sv.name as service_name,
  sv.type as service_type,
  t.supplier_cost,
  t.customer_price,
  t.profit as expected_profit,
  t.currency,
  coalesce(cp.total_paid, 0) as total_customer_paid,
  t.customer_price - coalesce(cp.total_paid, 0) as customer_remaining,
  coalesce(sp.total_paid, 0) as total_supplier_paid,
  t.supplier_cost - coalesce(sp.total_paid, 0) as supplier_remaining,
  coalesce(cp.total_paid, 0) - coalesce(sp.total_paid, 0) as actual_cash_profit,
  t.customer_payment_status,
  t.supplier_payment_status,
  t.status,
  t.created_by,
  t.created_at
from public.transactions t
join public.customers c on c.id = t.customer_id
join public.suppliers s on s.id = t.supplier_id
join public.services sv on sv.id = t.service_id
left join (
  select transaction_id, sum(amount) as total_paid
  from public.customer_payments
  group by transaction_id
) cp on cp.transaction_id = t.id
left join (
  select transaction_id, sum(amount) as total_paid
  from public.supplier_payments
  group by transaction_id
) sp on sp.transaction_id = t.id;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.services enable row level security;
alter table public.transactions enable row level security;
alter table public.customer_payments enable row level security;
alter table public.supplier_payments enable row level security;

create policy "Profiles are visible to authenticated users" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "Admins manage profiles" on public.profiles
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Authenticated users view customers" on public.customers
for select to authenticated using (public.get_current_user_role() in ('admin', 'employee'));
create policy "Admins manage customers" on public.customers
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Authenticated users view suppliers" on public.suppliers
for select to authenticated using (public.get_current_user_role() in ('admin', 'employee'));
create policy "Admins manage suppliers" on public.suppliers
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Authenticated users view services" on public.services
for select to authenticated using (public.get_current_user_role() in ('admin', 'employee'));
create policy "Admins manage services" on public.services
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Employees create services" on public.services
for insert to authenticated with check (public.get_current_user_role() in ('admin', 'employee'));

create policy "Authenticated users view transactions" on public.transactions
for select to authenticated using (public.get_current_user_role() in ('admin', 'employee'));
create policy "Admins manage transactions" on public.transactions
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Employees create transactions" on public.transactions
for insert to authenticated with check (public.get_current_user_role() in ('admin', 'employee'));

create policy "Authenticated users view customer payments" on public.customer_payments
for select to authenticated using (public.get_current_user_role() in ('admin', 'employee'));
create policy "Admins manage customer payments" on public.customer_payments
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Employees create customer payments" on public.customer_payments
for insert to authenticated with check (public.get_current_user_role() in ('admin', 'employee'));

create policy "Authenticated users view supplier payments" on public.supplier_payments
for select to authenticated using (public.get_current_user_role() in ('admin', 'employee'));
create policy "Admins manage supplier payments" on public.supplier_payments
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Employees create supplier payments" on public.supplier_payments
for insert to authenticated with check (public.get_current_user_role() in ('admin', 'employee'));
