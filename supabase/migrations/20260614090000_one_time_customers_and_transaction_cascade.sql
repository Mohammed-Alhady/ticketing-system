do $$
declare
  one_time_customer_id uuid;
  transaction_fk record;
begin
  insert into public.customers (name, notes)
  select 'عملاء لمرة واحدة', 'حساب مخصص لتجميع معاملات العملاء المؤقتين / لمرة واحدة'
  where not exists (
    select 1 from public.customers where name = 'عملاء لمرة واحدة'
  );

  select id into one_time_customer_id
  from public.customers
  where name = 'عملاء لمرة واحدة'
  order by created_at, id
  limit 1;

  update public.transactions
  set customer_id = one_time_customer_id
  where customer_id is null;

  alter table public.transactions
  drop constraint if exists transactions_customer_or_guest_check;

  alter table public.transactions
  alter column customer_id set not null;

  for transaction_fk in
    select conname
    from pg_constraint
    where conrelid = 'public.customer_account_entries'::regclass
      and contype = 'f'
      and confrelid = 'public.transactions'::regclass
  loop
    execute format('alter table public.customer_account_entries drop constraint %I', transaction_fk.conname);
  end loop;

  for transaction_fk in
    select conname
    from pg_constraint
    where conrelid = 'public.supplier_account_entries'::regclass
      and contype = 'f'
      and confrelid = 'public.transactions'::regclass
  loop
    execute format('alter table public.supplier_account_entries drop constraint %I', transaction_fk.conname);
  end loop;

  update public.customer_account_entries e
  set transaction_id = null
  where transaction_id is not null
    and not exists (
      select 1 from public.transactions t where t.id = e.transaction_id
    );

  update public.supplier_account_entries e
  set transaction_id = null
  where transaction_id is not null
    and not exists (
      select 1 from public.transactions t where t.id = e.transaction_id
    );

  alter table public.customer_account_entries
  add constraint customer_account_entries_transaction_id_fkey
  foreign key (transaction_id) references public.transactions(id) on delete cascade;

  alter table public.supplier_account_entries
  add constraint supplier_account_entries_transaction_id_fkey
  foreign key (transaction_id) references public.transactions(id) on delete cascade;
end $$;

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

insert into public.customer_account_entries (
  customer_id,
  entry_date,
  entry_type,
  direction,
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
  'debit',
  t.customer_price,
  t.currency,
  coalesce(t.notes, 'Transaction charge: ' || coalesce(sv.name, 'service')),
  t.id,
  t.created_by,
  t.created_at
from public.transactions t
join public.services sv on sv.id = t.service_id
where t.customer_id is not null
  and not exists (
    select 1
    from public.customer_account_entries e
    where e.transaction_id = t.id
      and e.entry_type = 'transaction_charge'
  );

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
  coalesce(nullif(btrim(t.guest_customer_name), ''), c.name) as customer_name,
  coalesce(nullif(btrim(t.guest_customer_phone), ''), c.phone) as customer_phone,
  t.guest_customer_name,
  t.guest_customer_phone,
  t.guest_customer_notes,
  case when nullif(btrim(t.guest_customer_name), '') is not null then 'guest' else 'saved' end as customer_type,
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
