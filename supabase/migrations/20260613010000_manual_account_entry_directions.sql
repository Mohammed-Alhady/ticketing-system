alter table public.customer_account_entries
add column if not exists direction text;

alter table public.supplier_account_entries
add column if not exists direction text;

update public.customer_account_entries
set direction = case
  when entry_type in ('transaction_charge', 'opening_balance', 'manual_debt', 'adjustment') then 'debit'
  when entry_type in ('payment', 'manual_credit') then 'credit'
  else 'debit'
end
where direction is null;

update public.supplier_account_entries
set direction = case
  when entry_type in ('transaction_cost', 'opening_balance', 'manual_debt', 'adjustment') then 'debit'
  when entry_type in ('payment', 'manual_credit') then 'credit'
  else 'debit'
end
where direction is null;

alter table public.customer_account_entries
alter column direction set not null;

alter table public.supplier_account_entries
alter column direction set not null;

alter table public.customer_account_entries
alter column transaction_id drop not null;

alter table public.supplier_account_entries
alter column transaction_id drop not null;

alter table public.customer_account_entries
drop constraint if exists customer_account_entries_entry_type_check,
drop constraint if exists customer_account_entries_direction_check,
drop constraint if exists customer_account_entries_amount_positive_check;

alter table public.supplier_account_entries
drop constraint if exists supplier_account_entries_entry_type_check,
drop constraint if exists supplier_account_entries_direction_check,
drop constraint if exists supplier_account_entries_amount_positive_check;

alter table public.customer_account_entries
add constraint customer_account_entries_entry_type_check
check (entry_type in ('transaction_charge', 'payment', 'opening_balance', 'manual_debt', 'manual_credit', 'adjustment')),
add constraint customer_account_entries_direction_check
check (direction in ('debit', 'credit')),
add constraint customer_account_entries_amount_positive_check
check (amount > 0);

alter table public.supplier_account_entries
add constraint supplier_account_entries_entry_type_check
check (entry_type in ('transaction_cost', 'payment', 'opening_balance', 'manual_debt', 'manual_credit', 'adjustment')),
add constraint supplier_account_entries_direction_check
check (direction in ('debit', 'credit')),
add constraint supplier_account_entries_amount_positive_check
check (amount > 0);

create or replace function public.set_account_entry_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by = old.created_by;
  end if;

  return new;
end;
$$;

drop trigger if exists customer_account_entries_set_created_by on public.customer_account_entries;
create trigger customer_account_entries_set_created_by
before insert or update on public.customer_account_entries
for each row execute function public.set_account_entry_created_by();

drop trigger if exists supplier_account_entries_set_created_by on public.supplier_account_entries;
create trigger supplier_account_entries_set_created_by
before insert or update on public.supplier_account_entries
for each row execute function public.set_account_entry_created_by();

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

create or replace view public.customer_balances_by_currency
with (security_invoker = true)
as
select
  e.customer_id,
  c.name as customer_name,
  e.currency,
  sum(
    case
      when e.direction = 'debit' then e.amount
      when e.direction = 'credit' then -e.amount
      else 0
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
      when e.direction = 'debit' then e.amount
      when e.direction = 'credit' then -e.amount
      else 0
    end
  ) as balance
from public.supplier_account_entries e
join public.suppliers s on s.id = e.supplier_id
group by e.supplier_id, s.name, e.currency;

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

drop policy if exists "Authenticated users view customer account entries" on public.customer_account_entries;
drop policy if exists "Admins manage customer account entries" on public.customer_account_entries;
drop policy if exists "Employees create customer account entries" on public.customer_account_entries;

create policy "Authenticated users view customer account entries" on public.customer_account_entries
for select to authenticated using (public.get_current_user_role() in ('admin', 'employee'));

create policy "Admins manage customer account entries" on public.customer_account_entries
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Employees create customer account entries" on public.customer_account_entries
for insert to authenticated
with check (
  public.is_admin()
  or (
    public.is_employee()
    and created_by = auth.uid()
    and amount > 0
    and direction in ('debit', 'credit')
    and entry_type in ('transaction_charge', 'payment', 'opening_balance', 'manual_debt', 'manual_credit', 'adjustment')
  )
);

drop policy if exists "Authenticated users view supplier account entries" on public.supplier_account_entries;
drop policy if exists "Admins manage supplier account entries" on public.supplier_account_entries;
drop policy if exists "Employees create supplier account entries" on public.supplier_account_entries;

create policy "Authenticated users view supplier account entries" on public.supplier_account_entries
for select to authenticated using (public.get_current_user_role() in ('admin', 'employee'));

create policy "Admins manage supplier account entries" on public.supplier_account_entries
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Employees create supplier account entries" on public.supplier_account_entries
for insert to authenticated
with check (
  public.is_admin()
  or (
    public.is_employee()
    and created_by = auth.uid()
    and amount > 0
    and direction in ('debit', 'credit')
    and entry_type in ('transaction_cost', 'payment', 'opening_balance', 'manual_debt', 'manual_credit', 'adjustment')
  )
);
