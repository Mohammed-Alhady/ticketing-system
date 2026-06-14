import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AmountText } from '../../components/ui/AmountText'
import { FormModal } from '../../components/ui/FormModal'
import { supabase } from '../../lib/supabase'
import { today } from '../../utils/dates'
import { buildTicketMessage, customerDisplayName, customerDisplayPhone, routeSegmentsDetails, routeSummary, whatsappUrl } from '../../utils/tickets'
import type { Customer, CustomerAccountEntry, Profile, Service, Supplier, SupplierAccountEntry, TransactionReportRow } from '../../types/models'
import { ReportFilters } from './components/ReportFilters'
import { ReportTable, type ReportColumn } from './components/ReportTable'
import { ReportTabs, type TabItem } from './components/ReportTabs'
import { SummaryCards, type SummaryCardItem } from './components/SummaryCards'

type ReportRow = Record<string, unknown>
type ReportState = {
  searched: boolean
  rows: ReportRow[]
  columns: ReportColumn<ReportRow>[]
  summaries: SummaryCardItem[]
  empty?: string
}

const emptyReport: ReportState = { searched: false, rows: [], columns: [], summaries: [] }

const mainTabs: TabItem[] = [
  { id: 'customers', label: 'العملاء' },
  { id: 'suppliers', label: 'الموردون' },
  { id: 'financial', label: 'المالية' },
  { id: 'flights', label: 'الرحلات' },
  { id: 'employees', label: 'الموظفون' },
]

const subTabs: Record<string, TabItem[]> = {
  customers: [
    { id: 'customer-statement', label: 'كشف حساب' },
    { id: 'customer-debts', label: 'الديون' },
    { id: 'customer-transactions', label: 'معاملات العميل' },
  ],
  suppliers: [
    { id: 'supplier-statement', label: 'كشف الحساب' },
    { id: 'supplier-debts', label: 'الديون' },
    { id: 'supplier-transactions', label: 'معاملات المورد' },
  ],
  financial: [
    { id: 'profits', label: 'الأرباح' },
    { id: 'financial-summary', label: 'الملخص المالي' },
    { id: 'manual-entries', label: 'الحركات اليدوية' },
  ],
  flights: [
    { id: 'upcoming-departures', label: 'الرحلات القادمة' },
    { id: 'upcoming-returns', label: 'رحلات العودة' },
    { id: 'all-tickets', label: 'جميع التذاكر' },
  ],
  employees: [
    { id: 'employee-performance', label: 'الأداء' },
    { id: 'employee-transactions', label: 'المعاملات' },
  ],
}

const initialFilters = {
  customerStatement: { customer: '', dateFrom: '', dateTo: '', currency: '' },
  supplierStatement: { supplier: '', dateFrom: '', dateTo: '', currency: '' },
  debts: { currency: '', positiveOnly: true, search: '' },
  customerTransactions: { customer: '', dateFrom: '', dateTo: '', service: '', currency: '' },
  supplierTransactions: { supplier: '', dateFrom: '', dateTo: '', service: '', currency: '' },
  profits: { dateFrom: '', dateTo: '', employee: '', supplier: '', currency: '' },
  manualEntries: { party: '', entryType: '', direction: '', dateFrom: '', dateTo: '', currency: '', createdBy: '' },
  flights: { range: '30', dateFrom: '', dateTo: '', customer: '', guestCustomer: '', ticketNumber: '', pnr: '', employee: '' },
  employeePerformance: { dateFrom: '', dateTo: '', currency: '' },
  employeeTransactions: { employee: '', dateFrom: '', dateTo: '' },
}

function debit(row: CustomerAccountEntry | SupplierAccountEntry) {
  return row.direction === 'debit' ? Number(row.amount) : 0
}

function credit(row: CustomerAccountEntry | SupplierAccountEntry) {
  return row.direction === 'credit' ? Number(row.amount) : 0
}

function withRunning(rows: (CustomerAccountEntry | SupplierAccountEntry)[]) {
  const runningByCurrency = new Map<string, number>()
  return rows.map((row) => {
    const running = (runningByCurrency.get(row.currency) ?? 0) + debit(row) - credit(row)
    runningByCurrency.set(row.currency, running)
    return { ...row, running_balance: running }
  })
}

function entryLabel(type: string) {
  if (type === 'transaction_charge') return 'قيد معاملة'
  if (type === 'transaction_cost') return 'تكلفة معاملة'
  if (type === 'payment') return 'دفعة'
  if (type === 'opening_balance') return 'رصيد افتتاحي'
  if (type === 'manual_debt') return 'دين يدوي'
  if (type === 'manual_credit') return 'دائن يدوي'
  return 'تسوية'
}

function sumByCurrency(rows: { currency: string; amount: number }[]) {
  const map = new Map<string, number>()
  for (const row of rows) map.set(row.currency, (map.get(row.currency) ?? 0) + row.amount)
  return [...map.entries()].map(([currency, amount]) => ({ currency, amount }))
}

function toReportRows<T extends Record<string, unknown>>(rows: T[]) {
  return rows as ReportRow[]
}

export function ReportsPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [mainTab, setMainTab] = useState('customers')
  const [activeReport, setActiveReport] = useState('customer-statement')
  const [filters, setFilters] = useState(initialFilters)
  const [report, setReport] = useState<ReportState>(emptyReport)
  const [messageRow, setMessageRow] = useState<TransactionReportRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function loadMeta() {
      setLoading(true)
      const [customerRows, supplierRows, serviceRows, profileRows] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('services').select('*').order('name'),
        supabase.from('profiles').select('*').order('full_name'),
      ])
      const firstError = customerRows.error ?? supplierRows.error ?? serviceRows.error ?? profileRows.error
      if (firstError) setError(firstError.message)
      setCustomers((customerRows.data ?? []) as Customer[])
      setSuppliers((supplierRows.data ?? []) as Supplier[])
      setServices((serviceRows.data ?? []) as Service[])
      setProfiles((profileRows.data ?? []) as Profile[])
      setLoading(false)
    }
    loadMeta()
  }, [])

  const activeTitle = useMemo(() => subTabs[mainTab].find((tab) => tab.id === activeReport)?.label ?? '', [activeReport, mainTab])

  function changeMainTab(tab: string) {
    setMainTab(tab)
    setActiveReport(subTabs[tab][0].id)
    resetReportOnly()
  }

  function changeSubTab(tab: string) {
    setActiveReport(tab)
    resetReportOnly()
  }

  function resetReportOnly() {
    setReport(emptyReport)
    setError('')
    setSuccess('')
  }

  async function runReport(event: FormEvent) {
    event.preventDefault()
    setReportLoading(true)
    setError('')
    setSuccess('')
    try {
      if (activeReport === 'customer-statement') await loadStatement('customer')
      else if (activeReport === 'supplier-statement') await loadStatement('supplier')
      else if (activeReport === 'customer-debts') await loadDebts('customer')
      else if (activeReport === 'supplier-debts') await loadDebts('supplier')
      else if (activeReport === 'customer-transactions') await loadPartyTransactions('customer')
      else if (activeReport === 'supplier-transactions') await loadPartyTransactions('supplier')
      else if (activeReport === 'profits') await loadProfits()
      else if (activeReport === 'financial-summary') await loadFinancialSummary()
      else if (activeReport === 'manual-entries') await loadManualEntries()
      else if (activeReport === 'upcoming-departures') await loadFlights('departure')
      else if (activeReport === 'upcoming-returns') await loadFlights('return')
      else if (activeReport === 'all-tickets') await loadFlights('all')
      else if (activeReport === 'employee-performance') await loadEmployeePerformance()
      else if (activeReport === 'employee-transactions') await loadEmployeeTransactions()
    } finally {
      setReportLoading(false)
      setFiltersOpen(false)
    }
  }

  async function loadStatement(type: 'customer' | 'supplier') {
    const form = type === 'customer' ? filters.customerStatement : filters.supplierStatement
    const selectedId = type === 'customer' ? filters.customerStatement.customer : filters.supplierStatement.supplier
    if (!selectedId) {
      setError(type === 'customer' ? 'اختر العميل أولا.' : 'اختر المورد أولا.')
      setReport(emptyReport)
      return
    }

    let query = supabase
      .from(type === 'customer' ? 'customer_account_entries' : 'supplier_account_entries')
      .select('*, profiles(full_name)')
      .eq(type === 'customer' ? 'customer_id' : 'supplier_id', selectedId)
      .order('entry_date')
      .order('created_at')
    if (form.dateFrom) query = query.gte('entry_date', form.dateFrom)
    if (form.dateTo) query = query.lte('entry_date', form.dateTo)
    if (form.currency) query = query.eq('currency', form.currency)
    const { data, error } = await query
    if (error) throw error
    const rows = withRunning((data ?? []) as (CustomerAccountEntry | SupplierAccountEntry)[])
    const currency = form.currency || rows[0]?.currency || 'LYD'
    setReport({
      searched: true,
      rows: toReportRows(rows),
      summaries: [
        { title: 'إجمالي المدين', value: <AmountText value={rows.reduce((sum, row) => sum + debit(row), 0)} currency={currency} />, tone: 'profit' },
        { title: 'إجمالي الدائن', value: <AmountText value={rows.reduce((sum, row) => sum + credit(row), 0)} currency={currency} />, tone: 'transactions' },
        { title: 'الرصيد النهائي', value: <AmountText value={Number(rows.at(-1)?.running_balance ?? 0)} currency={currency} />, tone: 'debt' },
      ],
      columns: statementColumns(),
    })
  }

  async function loadDebts(type: 'customer' | 'supplier') {
    const form = filters.debts
    const [balanceRows, transactionRows] = await Promise.all([
      supabase.from(type === 'customer' ? 'customer_balances_by_currency' : 'supplier_balances_by_currency').select('*'),
      supabase.from('transaction_report_view').select('*').order('transaction_date', { ascending: false }).limit(1000),
    ])
    if (balanceRows.error) throw balanceRows.error
    if (transactionRows.error) throw transactionRows.error
    const transactions = (transactionRows.data ?? []) as TransactionReportRow[]
    const rows = (balanceRows.data ?? []).filter((row) => {
      const name = String(row[type === 'customer' ? 'customer_name' : 'supplier_name'] ?? '')
      const balance = Number(row.balance)
      if (form.currency && row.currency !== form.currency) return false
      if (form.positiveOnly && balance <= 0) return false
      if (form.search && !name.toLowerCase().includes(form.search.toLowerCase())) return false
      return true
    }).map((row) => {
      const id = String(row[type === 'customer' ? 'customer_id' : 'supplier_id'])
      const party = type === 'customer' ? customers.find((item) => item.id === id) : suppliers.find((item) => item.id === id)
      const latest = transactions.find((transaction) => type === 'customer' ? transaction.customer_id === id : transaction.supplier_id === id)
      return { name: String(row[type === 'customer' ? 'customer_name' : 'supplier_name']), phone: party?.phone ?? '', currency: String(row.currency), balance: Number(row.balance), last_transaction_date: latest?.transaction_date ?? '' }
    })
    setReport({
      searched: true,
      rows,
      summaries: sumByCurrency(rows.map((row) => ({ currency: row.currency, amount: row.balance }))).map((row) => ({ title: `الإجمالي ${row.currency}`, value: <AmountText value={row.amount} currency={row.currency} />, tone: 'debt' })),
      columns: debtColumns(type),
    })
  }

  async function loadPartyTransactions(type: 'customer' | 'supplier') {
    const form = type === 'customer' ? filters.customerTransactions : filters.supplierTransactions
    const id = type === 'customer' ? filters.customerTransactions.customer : filters.supplierTransactions.supplier
    if (!id) {
      setError(type === 'customer' ? 'اختر العميل أولا.' : 'اختر المورد أولا.')
      setReport(emptyReport)
      return
    }
    let query = supabase.from('transaction_report_view').select('*').eq(type === 'customer' ? 'customer_id' : 'supplier_id', id).order('transaction_date', { ascending: false })
    if (form.dateFrom) query = query.gte('transaction_date', form.dateFrom)
    if (form.dateTo) query = query.lte('transaction_date', form.dateTo)
    if (form.service) query = query.eq('service_id', form.service)
    if (form.currency) query = query.eq('currency', form.currency)
    const { data, error } = await query.limit(500)
    if (error) throw error
    setTransactionResult((data ?? []) as TransactionReportRow[])
  }

  async function loadProfits() {
    const form = filters.profits
    let query = supabase.from('transaction_report_view').select('*')
    if (form.dateFrom) query = query.gte('transaction_date', form.dateFrom)
    if (form.dateTo) query = query.lte('transaction_date', form.dateTo)
    if (form.employee) query = query.eq('employee_id', form.employee)
    if (form.supplier) query = query.eq('supplier_id', form.supplier)
    if (form.currency) query = query.eq('currency', form.currency)
    const { data, error } = await query.limit(1000)
    if (error) throw error
    const transactions = (data ?? []) as TransactionReportRow[]
    const actualProfit = await actualProfitRows(form.dateFrom, form.dateTo, form.currency)
    const expected = sumByCurrency(transactions.map((row) => ({ currency: row.currency, amount: Number(row.expected_profit) })))
    setReport({
      searched: true,
      rows: groupedTransactionRows(transactions),
      summaries: [
        { title: 'عدد المعاملات', value: transactions.length, tone: 'transactions' },
        ...expected.map((row) => ({ title: `الربح المتوقع ${row.currency}`, value: <AmountText value={row.amount} currency={row.currency} />, tone: 'profit' as const })),
        ...actualProfit.map((row) => ({ title: `الربح الفعلي ${row.currency}`, value: <AmountText value={row.amount} currency={row.currency} />, tone: 'profit' as const })),
      ],
      columns: groupedColumns('العملة', true),
    })
  }

  async function loadFinancialSummary() {
    const [customerBalances, supplierBalances, transactions] = await Promise.all([
      supabase.from('customer_balances_by_currency').select('*'),
      supabase.from('supplier_balances_by_currency').select('*'),
      supabase.from('transaction_report_view').select('*').limit(1000),
    ])
    if (customerBalances.error) throw customerBalances.error
    if (supplierBalances.error) throw supplierBalances.error
    if (transactions.error) throw transactions.error
    const txRows = (transactions.data ?? []) as TransactionReportRow[]
    const actual = await actualProfitRows('', '', '')
    const rows = [
      ...sumByCurrency((customerBalances.data ?? []).map((row) => ({ currency: String(row.currency), amount: Number(row.balance) }))).map((row) => ({ item: 'ديون العملاء', ...row })),
      ...sumByCurrency((supplierBalances.data ?? []).map((row) => ({ currency: String(row.currency), amount: Number(row.balance) }))).map((row) => ({ item: 'ديون الموردين', ...row })),
      ...sumByCurrency(txRows.map((row) => ({ currency: row.currency, amount: Number(row.expected_profit) }))).map((row) => ({ item: 'الربح المتوقع', ...row })),
      ...actual.map((row) => ({ item: 'الربح الفعلي', ...row })),
    ]
    setReport({
      searched: true,
      rows,
      summaries: [],
      columns: [
        { key: 'item', header: 'البند', render: (row) => String(row.item) },
        { key: 'currency', header: 'العملة', render: (row) => String(row.currency) },
        { key: 'amount', header: 'الإجمالي', render: (row) => <AmountText value={Number(row.amount)} currency={String(row.currency)} /> },
      ],
    })
  }

  async function loadManualEntries() {
    const form = filters.manualEntries
    const rows = [
      ...(!form.party || form.party === 'customer' ? await manualEntriesFor('customer') : []),
      ...(!form.party || form.party === 'supplier' ? await manualEntriesFor('supplier') : []),
    ]
    setReport({ searched: true, rows, summaries: [{ title: 'عدد الحركات', value: rows.length, tone: 'transactions' }], columns: manualColumns() })
  }

  async function manualEntriesFor(type: 'customer' | 'supplier') {
    const form = filters.manualEntries
    let query = supabase.from(type === 'customer' ? 'customer_account_entries' : 'supplier_account_entries').select(type === 'customer' ? '*, customers(name), profiles(full_name)' : '*, suppliers(name), profiles(full_name)').in('entry_type', ['opening_balance', 'manual_debt', 'manual_credit', 'adjustment'])
    if (form.entryType) query = query.eq('entry_type', form.entryType)
    if (form.direction) query = query.eq('direction', form.direction)
    if (form.dateFrom) query = query.gte('entry_date', form.dateFrom)
    if (form.dateTo) query = query.lte('entry_date', form.dateTo)
    if (form.currency) query = query.eq('currency', form.currency)
    if (form.createdBy) query = query.eq('created_by', form.createdBy)
    const { data, error } = await query.limit(500)
    if (error) throw error
    return (data ?? []).map((row) => ({
      party_type: type === 'customer' ? 'عميل' : 'مورد',
      party_name: type === 'customer' ? row.customers?.name : row.suppliers?.name,
      entry_date: row.entry_date,
      entry_type: row.entry_type,
      direction: row.direction,
      amount: Number(row.amount),
      currency: row.currency,
      created_by_name: row.profiles?.full_name,
    }))
  }

  async function loadFlights(mode: 'departure' | 'return' | 'all') {
    const form = filters.flights
    let query = supabase.from('transaction_report_view').select('*').eq('service_type', 'ticket')
    const field = mode === 'return' ? 'return_date' : 'departure_date'
    if (mode !== 'all') {
      const range = dateRange(form.range, form.dateFrom, form.dateTo)
      if (range.from) query = query.gte(field, range.from)
      if (range.to) query = query.lte(field, range.to)
    }
    if (form.employee) query = query.eq('employee_id', form.employee)
    if (form.ticketNumber) query = query.ilike('ticket_number', `%${form.ticketNumber}%`)
    if (form.pnr) query = query.ilike('pnr', `%${form.pnr}%`)
    const { data, error } = await query.limit(500)
    if (error) throw error
    const rows = ((data ?? []) as TransactionReportRow[]).filter((row) => {
      if (form.customer && !customerDisplayName(row).toLowerCase().includes(form.customer.toLowerCase())) return false
      if (form.guestCustomer && !String(row.guest_customer_name ?? '').toLowerCase().includes(form.guestCustomer.toLowerCase())) return false
      return true
    })
    setReport({ searched: true, rows: toReportRows(rows), summaries: [{ title: 'عدد التذاكر', value: rows.length, tone: 'flights' }], columns: flightColumns() })
  }

  async function loadEmployeePerformance() {
    const form = filters.employeePerformance
    let query = supabase.from('transaction_report_view').select('*')
    if (form.dateFrom) query = query.gte('transaction_date', form.dateFrom)
    if (form.dateTo) query = query.lte('transaction_date', form.dateTo)
    if (form.currency) query = query.eq('currency', form.currency)
    const { data, error } = await query.limit(1000)
    if (error) throw error
    const rows = groupBy((data ?? []) as TransactionReportRow[], (row) => row.employee_id ?? 'none', (row) => row.employee_name ?? 'بدون موظف')
    setReport({ searched: true, rows, summaries: [{ title: 'عدد الموظفين', value: rows.length, tone: 'customers' }], columns: groupedColumns('الموظف') })
  }

  async function loadEmployeeTransactions() {
    const form = filters.employeeTransactions
    if (!form.employee) {
      setError('اختر الموظف أولا.')
      setReport(emptyReport)
      return
    }
    let query = supabase.from('transaction_report_view').select('*').eq('employee_id', form.employee).order('transaction_date', { ascending: false })
    if (form.dateFrom) query = query.gte('transaction_date', form.dateFrom)
    if (form.dateTo) query = query.lte('transaction_date', form.dateTo)
    const { data, error } = await query.limit(500)
    if (error) throw error
    setTransactionResult((data ?? []) as TransactionReportRow[])
  }

  async function actualProfitRows(dateFrom: string, dateTo: string, currency: string) {
    const [customerRows, supplierRows] = await Promise.all([
      paymentRows('customer_account_entries', dateFrom, dateTo, currency),
      paymentRows('supplier_account_entries', dateFrom, dateTo, currency),
    ])
    const map = new Map<string, number>()
    for (const row of customerRows) map.set(row.currency, (map.get(row.currency) ?? 0) + (row.direction === 'credit' ? row.amount : -row.amount))
    for (const row of supplierRows) map.set(row.currency, (map.get(row.currency) ?? 0) - (row.direction === 'credit' ? row.amount : -row.amount))
    return [...map.entries()].map(([currency, amount]) => ({ currency, amount }))
  }

  async function paymentRows(table: 'customer_account_entries' | 'supplier_account_entries', dateFrom: string, dateTo: string, currency: string) {
    let query = supabase.from(table).select('currency, amount, direction').eq('entry_type', 'payment')
    if (dateFrom) query = query.gte('entry_date', dateFrom)
    if (dateTo) query = query.lte('entry_date', dateTo)
    if (currency) query = query.eq('currency', currency)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((row) => ({ currency: String(row.currency), amount: Number(row.amount), direction: String(row.direction) }))
  }

  function setTransactionResult(rows: TransactionReportRow[]) {
    const grouped = groupedTransactionRows(rows)
    setReport({
      searched: true,
      rows: toReportRows(rows),
      summaries: [
        { title: 'عدد المعاملات', value: rows.length, tone: 'transactions' },
        ...grouped.map((row) => ({ title: `الربح ${row.currency}`, value: <AmountText value={Number(row.profit)} currency={String(row.currency)} />, tone: 'profit' as const })),
      ],
      columns: transactionColumns(),
    })
  }

  async function copyMessage(row: TransactionReportRow) {
    await navigator.clipboard.writeText(buildTicketMessage(row))
    setSuccess('تم نسخ الرسالة.')
    setMessageRow(null)
  }

  if (loading) return <div className="loading">جاري تحميل التقارير...</div>

  return (
    <section className="page reports-page">
      <div className="page-header">
        <h2>التقارير</h2>
      </div>
      {error && <div className="error">{error}</div>}
      {success && <div className="status ok">{success}</div>}
      {reportLoading && <div className="loading">جاري تحميل التقرير...</div>}

      <ReportTabs tabs={mainTabs} active={mainTab} onChange={changeMainTab} />
      <ReportTabs tabs={subTabs[mainTab]} active={activeReport} onChange={changeSubTab} className="sub-tabs" />

      <section className="report-section">
        <div className="page-header">
          <h3>{activeTitle}</h3>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => setFiltersOpen(true)}>الفلاتر</button>
            <span className="status">تصدير: قريبا</span>
          </div>
        </div>
        <SummaryCards cards={report.summaries} />
        {!report.searched && <div className="loading">اختر الفلاتر ثم اضغط بحث لعرض النتائج.</div>}
        {report.searched && <ReportTable rows={report.rows} columns={report.columns} empty={report.empty ?? 'لا توجد نتائج'} />}
      </section>

      {filtersOpen && (
        <FormModal title={`${activeTitle} - الفلاتر`} onClose={() => setFiltersOpen(false)}>
          <ReportFilters onSearch={runReport} onReset={resetActiveFilters}>
            {renderFilters()}
            <button type="button" className="secondary" onClick={() => setFiltersOpen(false)}>إغلاق</button>
          </ReportFilters>
        </FormModal>
      )}

      {messageRow && <TicketMessageModal row={messageRow} onCopy={copyMessage} onClose={() => setMessageRow(null)} />}
    </section>
  )

  function resetActiveFilters() {
    if (activeReport === 'customer-statement') setFilters((current) => ({ ...current, customerStatement: initialFilters.customerStatement }))
    else if (activeReport === 'supplier-statement') setFilters((current) => ({ ...current, supplierStatement: initialFilters.supplierStatement }))
    else if (activeReport.includes('debts')) setFilters((current) => ({ ...current, debts: initialFilters.debts }))
    else if (activeReport === 'customer-transactions') setFilters((current) => ({ ...current, customerTransactions: initialFilters.customerTransactions }))
    else if (activeReport === 'supplier-transactions') setFilters((current) => ({ ...current, supplierTransactions: initialFilters.supplierTransactions }))
    else if (activeReport === 'profits') setFilters((current) => ({ ...current, profits: initialFilters.profits }))
    else if (activeReport === 'manual-entries') setFilters((current) => ({ ...current, manualEntries: initialFilters.manualEntries }))
    else if (['upcoming-departures', 'upcoming-returns', 'all-tickets'].includes(activeReport)) setFilters((current) => ({ ...current, flights: initialFilters.flights }))
    else if (activeReport === 'employee-performance') setFilters((current) => ({ ...current, employeePerformance: initialFilters.employeePerformance }))
    else if (activeReport === 'employee-transactions') setFilters((current) => ({ ...current, employeeTransactions: initialFilters.employeeTransactions }))
    resetReportOnly()
  }

  function renderFilters() {
    if (activeReport === 'customer-statement') {
      const form = filters.customerStatement
      return <>
        <Select label="العميل" value={form.customer} options={customers.map((item) => [item.id, item.name])} onChange={(customer) => setFilters({ ...filters, customerStatement: { ...form, customer } })} />
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, customerStatement: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, customerStatement: { ...form, dateTo } })} />
        <CurrencyInput value={form.currency} onChange={(currency) => setFilters({ ...filters, customerStatement: { ...form, currency } })} />
      </>
    }
    if (activeReport === 'supplier-statement') {
      const form = filters.supplierStatement
      return <>
        <Select label="المورد" value={form.supplier} options={suppliers.map((item) => [item.id, item.name])} onChange={(supplier) => setFilters({ ...filters, supplierStatement: { ...form, supplier } })} />
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, supplierStatement: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, supplierStatement: { ...form, dateTo } })} />
        <CurrencyInput value={form.currency} onChange={(currency) => setFilters({ ...filters, supplierStatement: { ...form, currency } })} />
      </>
    }
    if (activeReport === 'customer-debts' || activeReport === 'supplier-debts') {
      const form = filters.debts
      return <>
        <CurrencyInput value={form.currency} onChange={(currency) => setFilters({ ...filters, debts: { ...form, currency } })} />
        <label className="checkbox-line"><input type="checkbox" checked={form.positiveOnly} onChange={(event) => setFilters({ ...filters, debts: { ...form, positiveOnly: event.target.checked } })} /> إظهار الأرصدة الأكبر من صفر فقط</label>
        <TextInput label="بحث بالاسم" value={form.search} onChange={(search) => setFilters({ ...filters, debts: { ...form, search } })} />
      </>
    }
    if (activeReport === 'customer-transactions') {
      const form = filters.customerTransactions
      return <>
        <Select label="العميل" value={form.customer} options={customers.map((item) => [item.id, item.name])} onChange={(customer) => setFilters({ ...filters, customerTransactions: { ...form, customer } })} />
        <CommonTransactionFilters form={form} onChange={(next) => setFilters({ ...filters, customerTransactions: { ...form, ...next } })} />
      </>
    }
    if (activeReport === 'supplier-transactions') {
      const form = filters.supplierTransactions
      return <>
        <Select label="المورد" value={form.supplier} options={suppliers.map((item) => [item.id, item.name])} onChange={(supplier) => setFilters({ ...filters, supplierTransactions: { ...form, supplier } })} />
        <CommonTransactionFilters form={form} onChange={(next) => setFilters({ ...filters, supplierTransactions: { ...form, ...next } })} />
      </>
    }
    if (activeReport === 'profits') {
      const form = filters.profits
      return <>
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, profits: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, profits: { ...form, dateTo } })} />
        <Select label="الموظف" value={form.employee} options={profiles.map((item) => [item.id, item.full_name])} onChange={(employee) => setFilters({ ...filters, profits: { ...form, employee } })} />
        <Select label="المورد" value={form.supplier} options={suppliers.map((item) => [item.id, item.name])} onChange={(supplier) => setFilters({ ...filters, profits: { ...form, supplier } })} />
        <CurrencyInput value={form.currency} onChange={(currency) => setFilters({ ...filters, profits: { ...form, currency } })} />
      </>
    }
    if (activeReport === 'financial-summary') return <div className="loading">اضغط بحث لإظهار الملخص المالي الحالي.</div>
    if (activeReport === 'manual-entries') {
      const form = filters.manualEntries
      return <>
        <Select label="الطرف" value={form.party} options={[['customer', 'عميل'], ['supplier', 'مورد']]} onChange={(party) => setFilters({ ...filters, manualEntries: { ...form, party } })} />
        <Select label="نوع القيد" value={form.entryType} options={[['opening_balance', 'رصيد افتتاحي'], ['manual_debt', 'دين يدوي'], ['manual_credit', 'دائن يدوي'], ['adjustment', 'تسوية']]} onChange={(entryType) => setFilters({ ...filters, manualEntries: { ...form, entryType } })} />
        <Select label="الاتجاه" value={form.direction} options={[['debit', 'مدين'], ['credit', 'دائن']]} onChange={(direction) => setFilters({ ...filters, manualEntries: { ...form, direction } })} />
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, manualEntries: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, manualEntries: { ...form, dateTo } })} />
        <CurrencyInput value={form.currency} onChange={(currency) => setFilters({ ...filters, manualEntries: { ...form, currency } })} />
        <Select label="أنشئ بواسطة" value={form.createdBy} options={profiles.map((item) => [item.id, item.full_name])} onChange={(createdBy) => setFilters({ ...filters, manualEntries: { ...form, createdBy } })} />
      </>
    }
    if (['upcoming-departures', 'upcoming-returns', 'all-tickets'].includes(activeReport)) {
      const form = filters.flights
      return <>
        {activeReport !== 'all-tickets' && <Select label="النطاق" value={form.range} options={[['today', 'اليوم'], ['7', 'القادمة خلال 7 أيام'], ['30', 'القادمة خلال 30 يوم'], ['custom', 'نطاق تاريخ']]} onChange={(range) => setFilters({ ...filters, flights: { ...form, range } })} />}
        {form.range === 'custom' && <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, flights: { ...form, dateFrom } })} />}
        {form.range === 'custom' && <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, flights: { ...form, dateTo } })} />}
        <TextInput label="العميل" value={form.customer} onChange={(customer) => setFilters({ ...filters, flights: { ...form, customer } })} />
        <TextInput label="العميل المؤقت" value={form.guestCustomer} onChange={(guestCustomer) => setFilters({ ...filters, flights: { ...form, guestCustomer } })} />
        <TextInput label="رقم التذكرة" value={form.ticketNumber} onChange={(ticketNumber) => setFilters({ ...filters, flights: { ...form, ticketNumber } })} />
        <TextInput label="PNR" value={form.pnr} onChange={(pnr) => setFilters({ ...filters, flights: { ...form, pnr } })} />
        <Select label="الموظف" value={form.employee} options={profiles.map((item) => [item.id, item.full_name])} onChange={(employee) => setFilters({ ...filters, flights: { ...form, employee } })} />
      </>
    }
    if (activeReport === 'employee-performance') {
      const form = filters.employeePerformance
      return <>
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, employeePerformance: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, employeePerformance: { ...form, dateTo } })} />
        <CurrencyInput value={form.currency} onChange={(currency) => setFilters({ ...filters, employeePerformance: { ...form, currency } })} />
      </>
    }
    if (activeReport === 'employee-transactions') {
      const form = filters.employeeTransactions
      return <>
        <Select label="الموظف" value={form.employee} options={profiles.map((item) => [item.id, item.full_name])} onChange={(employee) => setFilters({ ...filters, employeeTransactions: { ...form, employee } })} />
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, employeeTransactions: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, employeeTransactions: { ...form, dateTo } })} />
      </>
    }
    return null
  }

  function CommonTransactionFilters({ form, onChange }: { form: { dateFrom: string; dateTo: string; service: string; currency: string }; onChange: (next: Partial<typeof form>) => void }) {
    return <>
      <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => onChange({ dateFrom })} />
      <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => onChange({ dateTo })} />
      <Select label="الخدمة" value={form.service} options={services.map((item) => [item.id, item.name])} onChange={(service) => onChange({ service })} />
      <CurrencyInput value={form.currency} onChange={(currency) => onChange({ currency })} />
    </>
  }

  function transactionColumns(): ReportColumn<ReportRow>[] {
    return [
      { key: 'date', header: 'تاريخ المعاملة', render: (row) => String(row.transaction_date ?? '') },
      { key: 'customer', header: 'العميل', render: (row) => customerDisplayName(row as TransactionReportRow) },
      { key: 'supplier', header: 'المورد', render: (row) => String(row.supplier_name ?? '') },
      { key: 'service', header: 'الخدمة', render: (row) => String(row.service_name ?? '') },
      { key: 'ticket', header: 'رقم التذكرة', render: (row) => String(row.ticket_number ?? '-') },
      { key: 'pnr', header: 'PNR', render: (row) => String(row.pnr ?? '-') },
      { key: 'route', header: 'الوجهة', render: (row) => routeSummary(row.route_segments) || '-' },
      { key: 'supplier_cost', header: 'تكلفة المورد', render: (row) => <AmountText value={Number(row.supplier_cost)} currency={String(row.currency)} /> },
      { key: 'customer_price', header: 'سعر العميل', render: (row) => <AmountText value={Number(row.customer_price)} currency={String(row.currency)} /> },
      { key: 'profit', header: 'الربح', render: (row) => <AmountText value={Number(row.expected_profit)} currency={String(row.currency)} /> },
      { key: 'currency', header: 'العملة', render: (row) => String(row.currency ?? '') },
      { key: 'employee', header: 'الموظف', render: (row) => String(row.employee_name ?? '') },
    ]
  }

  function statementColumns(): ReportColumn<ReportRow>[] {
    return [
      { key: 'date', header: 'التاريخ', render: (row) => String(row.entry_date ?? '') },
      { key: 'description', header: 'الوصف', render: (row) => String(row.description ?? entryLabel(String(row.entry_type ?? ''))) },
      { key: 'debit', header: 'مدين', render: (row) => <AmountText value={String(row.direction) === 'debit' ? Number(row.amount) : 0} currency={String(row.currency)} /> },
      { key: 'credit', header: 'دائن', render: (row) => <AmountText value={String(row.direction) === 'credit' ? Number(row.amount) : 0} currency={String(row.currency)} /> },
      { key: 'balance', header: 'الرصيد الجاري', render: (row) => <AmountText value={Number(row.running_balance)} currency={String(row.currency)} /> },
      { key: 'currency', header: 'العملة', render: (row) => String(row.currency ?? '') },
      { key: 'created_by', header: 'أنشئ بواسطة', render: (row) => String((row.profiles as { full_name?: string } | undefined)?.full_name ?? '') },
    ]
  }

  function debtColumns(type: 'customer' | 'supplier'): ReportColumn<ReportRow>[] {
    return [
      { key: 'name', header: type === 'customer' ? 'العميل' : 'المورد', render: (row) => String(row.name ?? '') },
      { key: 'phone', header: 'الهاتف', render: (row) => String(row.phone || '-') },
      { key: 'balance', header: 'الرصيد', render: (row) => <AmountText value={Number(row.balance)} currency={String(row.currency)} /> },
      { key: 'last', header: 'آخر معاملة', render: (row) => String(row.last_transaction_date || '-') },
    ]
  }

  function flightColumns(): ReportColumn<ReportRow>[] {
    return [
      { key: 'customer', header: 'العميل', render: (row) => customerDisplayName(row as TransactionReportRow) },
      { key: 'phone', header: 'الهاتف', render: (row) => customerDisplayPhone(row as TransactionReportRow) || '-' },
      { key: 'route', header: 'الوجهة', render: (row) => routeSummary(row.route_segments) || '-' },
      { key: 'ticket', header: 'رقم التذكرة', render: (row) => String(row.ticket_number ?? '-') },
      { key: 'pnr', header: 'PNR', render: (row) => String(row.pnr ?? '-') },
      { key: 'departure', header: 'تاريخ الذهاب', render: (row) => routeSegmentsDetails(row.route_segments).join(' / ') || [row.departure_date, row.departure_time].filter(Boolean).join(' ') || '-' },
      { key: 'return', header: 'تاريخ العودة', render: (row) => [row.return_date, row.return_time].filter(Boolean).join(' ') || '-' },
      { key: 'supplier', header: 'المورد', render: (row) => String(row.supplier_name ?? '') },
      { key: 'employee', header: 'الموظف', render: (row) => String(row.employee_name ?? '') },
      { key: 'message', header: 'رسالة', render: (row) => <button className="secondary" onClick={() => setMessageRow(row as TransactionReportRow)}>رسالة</button> },
    ]
  }
}

function groupedTransactionRows(rows: TransactionReportRow[]) {
  return sumGrouped(rows, () => 'العملة', (row) => row.currency)
}

function groupBy(rows: TransactionReportRow[], idOf: (row: TransactionReportRow) => string, nameOf: (row: TransactionReportRow) => string) {
  return sumGrouped(rows, idOf, nameOf)
}

function sumGrouped(rows: TransactionReportRow[], idOf: (row: TransactionReportRow) => string, nameOf: (row: TransactionReportRow) => string) {
  const map = new Map<string, { name: string; currency: string; count: number; supplier_cost: number; customer_price: number; profit: number }>()
  for (const row of rows) {
    const key = `${idOf(row)}-${row.currency}`
    const current = map.get(key) ?? { name: nameOf(row), currency: row.currency, count: 0, supplier_cost: 0, customer_price: 0, profit: 0 }
    current.count += 1
    current.supplier_cost += Number(row.supplier_cost)
    current.customer_price += Number(row.customer_price)
    current.profit += Number(row.expected_profit)
    map.set(key, current)
  }
  return [...map.values()]
}

function groupedColumns(nameHeader: string, currencyAsName = false): ReportColumn<ReportRow>[] {
  return [
    { key: 'name', header: nameHeader, render: (row) => String(currencyAsName ? row.currency : row.name) },
    { key: 'currency', header: 'العملة', render: (row) => String(row.currency) },
    { key: 'count', header: 'عدد المعاملات', render: (row) => Number(row.count ?? 0) },
    { key: 'supplier_cost', header: 'تكلفة المورد', render: (row) => <AmountText value={Number(row.supplier_cost)} currency={String(row.currency)} /> },
    { key: 'customer_price', header: 'سعر العميل', render: (row) => <AmountText value={Number(row.customer_price)} currency={String(row.currency)} /> },
    { key: 'profit', header: 'الربح المتوقع', render: (row) => <AmountText value={Number(row.profit)} currency={String(row.currency)} /> },
  ]
}

function manualColumns(): ReportColumn<ReportRow>[] {
  return [
    { key: 'party_type', header: 'الطرف', render: (row) => String(row.party_type ?? '') },
    { key: 'party_name', header: 'الاسم', render: (row) => String(row.party_name ?? '') },
    { key: 'date', header: 'التاريخ', render: (row) => String(row.entry_date ?? '') },
    { key: 'type', header: 'نوع القيد', render: (row) => entryLabel(String(row.entry_type ?? '')) },
    { key: 'direction', header: 'الاتجاه', render: (row) => String(row.direction) === 'debit' ? 'مدين' : 'دائن' },
    { key: 'amount', header: 'المبلغ', render: (row) => <AmountText value={Number(row.amount)} currency={String(row.currency)} /> },
    { key: 'created_by', header: 'أنشئ بواسطة', render: (row) => String(row.created_by_name ?? '') },
  ]
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">الكل</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<input type="date" value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<input value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function CurrencyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label>العملة<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">كل العملات</option><option>LYD</option><option>USD</option><option>EUR</option></select></label>
}

function dateRange(range: string, dateFrom: string, dateTo: string) {
  const start = today()
  if (range === 'today') return { from: start, to: start }
  if (range === '7' || range === '30') {
    const date = new Date()
    date.setDate(date.getDate() + Number(range))
    return { from: start, to: date.toISOString().slice(0, 10) }
  }
  if (range === 'custom') return { from: dateFrom, to: dateTo }
  return { from: '', to: '' }
}

function TicketMessageModal({ row, onCopy, onClose }: { row: TransactionReportRow; onCopy: (row: TransactionReportRow) => void; onClose: () => void }) {
  const message = buildTicketMessage(row)
  const phone = customerDisplayPhone(row)
  const url = whatsappUrl(phone, message)
  return (
    <FormModal title="معاينة رسالة التذكرة" onClose={onClose}>
      <div className="page">
        <div className="message-preview">{message}</div>
        <div className="actions">
          <button onClick={() => onCopy(row)}>نسخ الرسالة</button>
          {url && <a className="button secondary" href={url} target="_blank" rel="noreferrer">فتح واتساب</a>}
          <button type="button" className="secondary" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </FormModal>
  )
}
