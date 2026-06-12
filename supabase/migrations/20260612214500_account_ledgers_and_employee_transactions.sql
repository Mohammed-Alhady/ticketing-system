alter table public.transactions
add column if not exists employee_id uuid references public.profiles(id);

update public.transactions
set employee_id = coalesce(employee_id, created_by)
where employee_id is null;

create table if not exists public.customer_account_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  entry_date date not null default current_date,
  entry_type text not null check (entry_type in ('transaction_charge', 'payment', 'adjustment')),
  amount numeric(12,2) not null,
  currency text not null check (currency in ('LYD', 'USD', 'EUR')),
  description text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_account_entries (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  entry_date date not null default current_date,
  entry_type text not null check (entry_type in ('transaction_cost', 'payment', 'adjustment')),
  amount numeric(12,2) not null,
  currency text not null check (currency in ('LYD', 'USD', 'EUR')),
  description text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists transactions_employee_idx on public.transactions(employee_id);
create index if not exists transactions_created_by_idx on public.transactions(created_by);
create index if not exists transactions_currency_idx on public.transactions(currency);

create index if not exists customer_account_entries_customer_idx on public.customer_account_entries(customer_id);
create index if not exists customer_account_entries_transaction_idx on public.customer_account_entries(transaction_id);
create index if not exists customer_account_entries_date_idx on public.customer_account_entries(entry_date);
create index if not exists customer_account_entries_currency_idx on public.customer_account_entries(currency);
create index if not exists customer_account_entries_created_by_idx on public.customer_account_entries(created_by);

create index if not exists supplier_account_entries_supplier_idx on public.supplier_account_entries(supplier_id);
create index if not exists supplier_account_entries_transaction_idx on public.supplier_account_entries(transaction_id);
create index if not exists supplier_account_entries_date_idx on public.supplier_account_entries(entry_date);
create index if not exists supplier_account_entries_currency_idx on public.supplier_account_entries(currency);
create index if not exists supplier_account_entries_created_by_idx on public.supplier_account_entries(created_by);

insert into public.customer_account_entries (
  customer_id,
  entry_date,
  entry_type,
  amount,
  currency,
  description,
  transaction_id,
  created_by,
  created_at
)
select
  t.customer_id,
  t.transaction_date,
  'transaction_charge',
  t.customer_price,
  t.currency,
  concat('Transaction charge: ', sv.name),
  t.id,
  t.created_by,
  t.created_at
from public.transactions t
join public.services sv on sv.id = t.service_id
where not exists (
  select 1
  from public.customer_account_entries e
  where e.transaction_id = t.id
    and e.entry_type = 'transaction_charge'
);

insert into public.supplier_account_entries (
  supplier_id,
  entry_date,
  entry_type,
  amount,
  currency,
  description,
  transaction_id,
  created_by,
  created_at
)
select
  t.supplier_id,
  t.transaction_date,
  'transaction_cost',
  t.supplier_cost,
  t.currency,
  concat('Transaction cost: ', sv.name),
  t.id,
  t.created_by,
  t.created_at
from public.transactions t
join public.services sv on sv.id = t.service_id
where not exists (
  select 1
  from public.supplier_account_entries e
  where e.transaction_id = t.id
    and e.entry_type = 'transaction_cost'
);

create or replace function public.create_transaction_account_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_name text;
begin
  select name into service_name from public.services where id = new.service_id;

  insert into public.customer_account_entries (
    customer_id,
    entry_date,
    entry_type,
    amount,
    currency,
    description,
    transaction_id,
    created_by
  )
  values (
    new.customer_id,
    new.transaction_date,
    'transaction_charge',
    new.customer_price,
    new.currency,
    coalesce(new.notes, 'Transaction charge: ' || coalesce(service_name, 'service')),
    new.id,
    coalesce(new.created_by, auth.uid())
  );

  insert into public.supplier_account_entries (
    supplier_id,
    entry_date,
    entry_type,
    amount,
    currency,
    description,
    transaction_id,
    created_by
  )
  values (
    new.supplier_id,
    new.transaction_date,
    'transaction_cost',
    new.supplier_cost,
    new.currency,
    coalesce(new.notes, 'Transaction cost: ' || coalesce(service_name, 'service')),
    new.id,
    coalesce(new.created_by, auth.uid())
  );

  return new;
end;
$$;

drop trigger if exists transactions_create_account_entries on public.transactions;
create trigger transactions_create_account_entries
after insert on public.transactions
for each row execute function public.create_transaction_account_entries();

create or replace function public.set_transaction_employee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by = auth.uid();
  end if;

  if new.employee_id is null then
    new.employee_id = auth.uid();
  end if;

  if public.is_employee() and new.employee_id <> auth.uid() then
    raise exception 'Employees can only create transactions for themselves';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_set_employee on public.transactions;
create trigger transactions_set_employee
before insert or update on public.transactions
for each row execute function public.set_transaction_employee();

create or replace view public.customer_balances_by_currency
with (security_invoker = true)
as
select
  e.customer_id,
  c.name as customer_name,
  e.currency,
  sum(
    case
      when e.entry_type = 'payment' then -e.amount
      else e.amount
    end
  ) as balance
from public.customer_account_entries e
join public.customers c on c.id = e.customer_id
group by e.customer_id, c.name, e.currency;

create or replace view public.supplier_balances_by_currency
with (security_invoker = true)
as
select
  e.supplier_id,
  s.name as supplier_name,
  e.currency,
  sum(
    case
      when e.entry_type = 'payment' then -e.amount
      else e.amount
    end
  ) as balance
from public.supplier_account_entries e
join public.suppliers s on s.id = e.supplier_id
group by e.supplier_id, s.name, e.currency;

create or replace view public.transaction_report_view
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
  t.employee_id,
  ep.full_name as employee_name,
  t.created_by,
  cp.full_name as created_by_name,
  t.created_at,
  t.status
from public.transactions t
join public.customers c on c.id = t.customer_id
join public.suppliers s on s.id = t.supplier_id
join public.services sv on sv.id = t.service_id
left join public.profiles ep on ep.id = t.employee_id
left join public.profiles cp on cp.id = t.created_by;

create or replace view public.transaction_summary
with (security_invoker = true)
as
select
  tr.transaction_id,
  tr.transaction_date,
  tr.issue_date,
  tr.customer_id,
  tr.customer_name,
  tr.supplier_id,
  tr.supplier_name,
  tr.service_id,
  tr.service_name,
  tr.service_type,
  tr.supplier_cost,
  tr.customer_price,
  tr.expected_profit,
  tr.currency,
  coalesce(cp.total_paid, 0) as total_customer_paid,
  tr.customer_price - coalesce(cp.total_paid, 0) as customer_remaining,
  coalesce(sp.total_paid, 0) as total_supplier_paid,
  tr.supplier_cost - coalesce(sp.total_paid, 0) as supplier_remaining,
  coalesce(cp.total_paid, 0) - coalesce(sp.total_paid, 0) as actual_cash_profit,
  case
    when coalesce(cp.total_paid, 0) <= 0 then 'unpaid'
    when coalesce(cp.total_paid, 0) >= tr.customer_price then 'paid'
    else 'partial'
  end as customer_payment_status,
  case
    when coalesce(sp.total_paid, 0) <= 0 then 'unpaid'
    when coalesce(sp.total_paid, 0) >= tr.supplier_cost then 'paid'
    else 'partial'
  end as supplier_payment_status,
  tr.status,
  tr.created_by,
  tr.created_at,
  tr.employee_id,
  tr.employee_name,
  tr.created_by_name
from public.transaction_report_view tr
left join (
  select transaction_id, sum(amount) as total_paid
  from public.customer_account_entries
  where entry_type = 'payment' and transaction_id is not null
  group by transaction_id
) cp on cp.transaction_id = tr.transaction_id
left join (
  select transaction_id, sum(amount) as total_paid
  from public.supplier_account_entries
  where entry_type = 'payment' and transaction_id is not null
  group by transaction_id
) sp on sp.transaction_id = tr.transaction_id;

alter table public.customer_account_entries enable row level security;
alter table public.supplier_account_entries enable row level security;

drop policy if exists "Profiles are visible to authenticated users" on public.profiles;
create policy "Profiles are visible to authenticated users" on public.profiles
for select to authenticated using (public.get_current_user_role() in ('admin', 'employee'));

drop policy if exists "Employees create transactions" on public.transactions;
create policy "Employees create transactions" on public.transactions
for insert to authenticated
with check (
  public.is_admin()
  or (public.is_employee() and employee_id = auth.uid() and created_by = auth.uid())
);

drop policy if exists "Employees update own new transactions" on public.transactions;
create policy "Employees update own new transactions" on public.transactions
for update to authenticated
using (public.is_employee() and false)
with check (public.is_employee() and false);

create policy "Authenticated users view customer account entries" on public.customer_account_entries
for select to authenticated using (public.get_current_user_role() in ('admin', 'employee'));
create policy "Admins manage customer account entries" on public.customer_account_entries
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Employees create customer account entries" on public.customer_account_entries
for insert to authenticated
with check (
  public.is_admin()
  or (public.is_employee() and created_by = auth.uid())
);

create policy "Authenticated users view supplier account entries" on public.supplier_account_entries
for select to authenticated using (public.get_current_user_role() in ('admin', 'employee'));
create policy "Admins manage supplier account entries" on public.supplier_account_entries
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Employees create supplier account entries" on public.supplier_account_entries
for insert to authenticated
with check (
  public.is_admin()
  or (public.is_employee() and created_by = auth.uid())
);
