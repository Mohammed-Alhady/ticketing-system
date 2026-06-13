alter table public.transactions
alter column customer_id drop not null;

alter table public.transactions
add column if not exists guest_customer_name text,
add column if not exists guest_customer_phone text,
add column if not exists guest_customer_notes text,
add column if not exists ticket_number text,
add column if not exists pnr text,
add column if not exists route_segments jsonb,
add column if not exists departure_date date,
add column if not exists departure_time time,
add column if not exists return_date date,
add column if not exists return_time time;

alter table public.transactions
drop constraint if exists transactions_customer_or_guest_check;

alter table public.transactions
add constraint transactions_customer_or_guest_check
check (
  customer_id is not null
  or nullif(btrim(guest_customer_name), '') is not null
);

create index if not exists transactions_ticket_number_idx on public.transactions(ticket_number);
create index if not exists transactions_pnr_idx on public.transactions(pnr);
create index if not exists transactions_departure_date_idx on public.transactions(departure_date);
create index if not exists transactions_return_date_idx on public.transactions(return_date);
create index if not exists transactions_guest_customer_name_idx on public.transactions(guest_customer_name);

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

  if new.customer_id is not null then
    insert into public.customer_account_entries (
      customer_id,
      entry_date,
      entry_type,
      direction,
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
      'debit',
      new.customer_price,
      new.currency,
      coalesce(new.notes, 'Transaction charge: ' || coalesce(service_name, 'service')),
      new.id,
      coalesce(new.created_by, auth.uid())
    );
  end if;

  insert into public.supplier_account_entries (
    supplier_id,
    entry_date,
    entry_type,
    direction,
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
    'debit',
    new.supplier_cost,
    new.currency,
    coalesce(new.notes, 'Transaction cost: ' || coalesce(service_name, 'service')),
    new.id,
    coalesce(new.created_by, auth.uid())
  );

  return new;
end;
$$;

drop view if exists public.transaction_summary;
drop view if exists public.transaction_report_view;

create or replace view public.transaction_report_view
with (security_invoker = true)
as
select
  t.id as transaction_id,
  t.transaction_date,
  t.issue_date,
  c.id as customer_id,
  coalesce(c.name, t.guest_customer_name) as customer_name,
  c.phone as customer_phone,
  t.guest_customer_name,
  t.guest_customer_phone,
  t.guest_customer_notes,
  case when t.customer_id is null then 'guest' else 'saved' end as customer_type,
  s.id as supplier_id,
  s.name as supplier_name,
  sv.id as service_id,
  sv.name as service_name,
  sv.type as service_type,
  t.supplier_cost,
  t.customer_price,
  t.profit as expected_profit,
  t.currency,
  t.ticket_number,
  t.pnr,
  t.route_segments,
  t.departure_date,
  t.departure_time,
  t.return_date,
  t.return_time,
  t.employee_id,
  ep.full_name as employee_name,
  t.created_by,
  cp.full_name as created_by_name,
  t.created_at,
  t.status
from public.transactions t
left join public.customers c on c.id = t.customer_id
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
  tr.customer_phone,
  tr.guest_customer_name,
  tr.guest_customer_phone,
  tr.guest_customer_notes,
  tr.customer_type,
  tr.supplier_id,
  tr.supplier_name,
  tr.service_id,
  tr.service_name,
  tr.service_type,
  tr.supplier_cost,
  tr.customer_price,
  tr.expected_profit,
  tr.currency,
  tr.ticket_number,
  tr.pnr,
  tr.route_segments,
  tr.departure_date,
  tr.departure_time,
  tr.return_date,
  tr.return_time,
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
  select
    transaction_id,
    sum(case when direction = 'credit' then amount when direction = 'debit' then -amount else 0 end) as total_paid
  from public.customer_account_entries
  where entry_type = 'payment' and transaction_id is not null
  group by transaction_id
) cp on cp.transaction_id = tr.transaction_id
left join (
  select
    transaction_id,
    sum(case when direction = 'credit' then amount when direction = 'debit' then -amount else 0 end) as total_paid
  from public.supplier_account_entries
  where entry_type = 'payment' and transaction_id is not null
  group by transaction_id
) sp on sp.transaction_id = tr.transaction_id;
