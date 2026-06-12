-- Clears demo/sample business data only.
-- Authentication users and public.profiles are intentionally preserved.
-- The delete order respects foreign keys and avoids deleting user/profile records.

do $$
begin
  if to_regclass('public.customer_account_entries') is not null then
    delete from public.customer_account_entries;
  end if;

  if to_regclass('public.supplier_account_entries') is not null then
    delete from public.supplier_account_entries;
  end if;

  if to_regclass('public.customer_payments') is not null then
    delete from public.customer_payments;
  end if;

  if to_regclass('public.supplier_payments') is not null then
    delete from public.supplier_payments;
  end if;

  if to_regclass('public.transactions') is not null then
    delete from public.transactions;
  end if;

  if to_regclass('public.services') is not null then
    delete from public.services;
  end if;

  if to_regclass('public.customers') is not null then
    delete from public.customers;
  end if;

  if to_regclass('public.suppliers') is not null then
    delete from public.suppliers;
  end if;
end $$;
