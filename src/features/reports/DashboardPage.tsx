import { useEffect, useMemo, useState } from 'react'
import { DashboardCard } from '../../components/ui/DashboardCard'
import { DataTable } from '../../components/ui/DataTable'
import { supabase } from '../../lib/supabase'
import { money } from '../../utils/money'
import type { CustomerBalance, SupplierBalance, TransactionReportRow } from '../../types/models'

type Counts = {
  transactions: number
  customers: number
  suppliers: number
  services: number
  monthTransactions: number
}

function monthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

function groupedMoney(rows: { currency: string; amount: number }[]) {
  if (!rows.length) return 'لا توجد بيانات'
  return rows.map((row) => money(row.amount, row.currency)).join(' / ')
}

export function DashboardPage() {
  const [counts, setCounts] = useState<Counts>({ transactions: 0, customers: 0, suppliers: 0, services: 0, monthTransactions: 0 })
  const [customerBalances, setCustomerBalances] = useState<CustomerBalance[]>([])
  const [supplierBalances, setSupplierBalances] = useState<SupplierBalance[]>([])
  const [monthTransactions, setMonthTransactions] = useState<TransactionReportRow[]>([])
  const [customerPayments, setCustomerPayments] = useState<{ currency: string; amount: number; direction: string }[]>([])
  const [supplierPayments, setSupplierPayments] = useState<{ currency: string; amount: number; direction: string }[]>([])
  const [latest, setLatest] = useState<TransactionReportRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { start, end } = monthRange()
      const [
        transactionsCount,
        customersCount,
        suppliersCount,
        servicesCount,
        monthTransactionsCount,
        customerBalanceRows,
        supplierBalanceRows,
        monthTransactionRows,
        latestRows,
        customerPaymentRows,
        supplierPaymentRows,
      ] = await Promise.all([
        supabase.from('transactions').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('suppliers').select('id', { count: 'exact', head: true }),
        supabase.from('services').select('id', { count: 'exact', head: true }),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).gte('transaction_date', start).lte('transaction_date', end),
        supabase.from('customer_balances_by_currency').select('*'),
        supabase.from('supplier_balances_by_currency').select('*'),
        supabase.from('transaction_report_view').select('*').gte('transaction_date', start).lte('transaction_date', end),
        supabase.from('transaction_report_view').select('*').order('transaction_date', { ascending: false }).limit(5),
        supabase.from('customer_account_entries').select('currency, amount, direction').eq('entry_type', 'payment').gte('entry_date', start).lte('entry_date', end),
        supabase.from('supplier_account_entries').select('currency, amount, direction').eq('entry_type', 'payment').gte('entry_date', start).lte('entry_date', end),
      ])

      const firstError = transactionsCount.error ?? customersCount.error ?? suppliersCount.error ?? servicesCount.error ?? monthTransactionsCount.error ?? customerBalanceRows.error ?? supplierBalanceRows.error ?? monthTransactionRows.error ?? latestRows.error ?? customerPaymentRows.error ?? supplierPaymentRows.error
      if (firstError) setError(firstError.message)

      setCounts({
        transactions: transactionsCount.count ?? 0,
        customers: customersCount.count ?? 0,
        suppliers: suppliersCount.count ?? 0,
        services: servicesCount.count ?? 0,
        monthTransactions: monthTransactionsCount.count ?? 0,
      })
      setCustomerBalances((customerBalanceRows.data ?? []) as CustomerBalance[])
      setSupplierBalances((supplierBalanceRows.data ?? []) as SupplierBalance[])
      setMonthTransactions((monthTransactionRows.data ?? []) as TransactionReportRow[])
      setLatest((latestRows.data ?? []) as TransactionReportRow[])
      setCustomerPayments((customerPaymentRows.data ?? []).map((row) => ({ currency: String(row.currency), amount: Number(row.amount), direction: String(row.direction) })))
      setSupplierPayments((supplierPaymentRows.data ?? []).map((row) => ({ currency: String(row.currency), amount: Number(row.amount), direction: String(row.direction) })))
      setLoading(false)
    }
    load()
  }, [])

  const totals = useMemo(() => {
    const customerDebt = new Map<string, number>()
    const supplierDebt = new Map<string, number>()
    const expectedProfit = new Map<string, number>()
    const actualProfit = new Map<string, number>()

    for (const row of customerBalances) customerDebt.set(row.currency, (customerDebt.get(row.currency) ?? 0) + Number(row.balance))
    for (const row of supplierBalances) supplierDebt.set(row.currency, (supplierDebt.get(row.currency) ?? 0) + Number(row.balance))
    for (const row of monthTransactions) expectedProfit.set(row.currency, (expectedProfit.get(row.currency) ?? 0) + Number(row.expected_profit))
    for (const row of customerPayments) actualProfit.set(row.currency, (actualProfit.get(row.currency) ?? 0) + (row.direction === 'credit' ? row.amount : -row.amount))
    for (const row of supplierPayments) actualProfit.set(row.currency, (actualProfit.get(row.currency) ?? 0) - (row.direction === 'credit' ? row.amount : -row.amount))

    const toRows = (map: Map<string, number>) => [...map.entries()].map(([currency, amount]) => ({ currency, amount }))

    return {
      customerDebt: toRows(customerDebt),
      supplierDebt: toRows(supplierDebt),
      expectedProfit: toRows(expectedProfit),
      actualProfit: toRows(actualProfit),
    }
  }, [customerBalances, customerPayments, monthTransactions, supplierBalances, supplierPayments])

  if (loading) return <div className="loading">جاري تحميل لوحة التحكم...</div>

  return (
    <section className="page">
      <div className="page-header">
        <h2>لوحة التحكم</h2>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="grid">
        <DashboardCard title="عدد المعاملات" value={counts.transactions} />
        <DashboardCard title="عدد العملاء" value={counts.customers} />
        <DashboardCard title="عدد الموردين" value={counts.suppliers} />
        <DashboardCard title="عدد الخدمات" value={counts.services} />
        <DashboardCard title="ديون العملاء حسب العملة" value={groupedMoney(totals.customerDebt)} />
        <DashboardCard title="ديون الموردين حسب العملة" value={groupedMoney(totals.supplierDebt)} />
        <DashboardCard title="ربح الشهر المتوقع" value={groupedMoney(totals.expectedProfit)} />
        <DashboardCard title="ربح الشهر الفعلي" value={groupedMoney(totals.actualProfit)} />
        <DashboardCard title="معاملات الشهر الحالي" value={counts.monthTransactions} />
      </div>
      <section className="card">
        <h3>آخر 5 معاملات</h3>
        <DataTable rows={latest} empty="لا توجد معاملات" columns={[
          { key: 'date', header: 'التاريخ', render: (row) => row.transaction_date },
          { key: 'customer', header: 'العميل', render: (row) => row.customer_name },
          { key: 'supplier', header: 'المورد', render: (row) => row.supplier_name },
          { key: 'service', header: 'الخدمة', render: (row) => row.service_name },
          { key: 'profit', header: 'الربح', render: (row) => money(row.expected_profit, row.currency) },
          { key: 'employee', header: 'الموظف', render: (row) => row.employee_name ?? '' },
        ]} />
      </section>
    </section>
  )
}
