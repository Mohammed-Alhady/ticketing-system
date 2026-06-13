import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AmountText } from '../../components/ui/AmountText'
import { supabase } from '../../lib/supabase'
import { today } from '../../utils/dates'
import { buildTicketMessage, customerDisplayPhone, routeSummary, whatsappUrl } from '../../utils/tickets'
import { FormModal } from '../../components/ui/FormModal'
import type { Customer, CustomerAccountEntry, Profile, Service, Supplier, SupplierAccountEntry, TransactionReportRow } from '../../types/models'
import { ReportCategoryAccordion, ReportPanel, type ReportItem } from './ReportCategoryAccordion'
import { ReportFilterForm } from './ReportFilterForm'
import { ReportResultsTable } from './ReportResultsTable'
import { ReportSummaryCards, type SummaryCard } from './ReportSummaryCards'

type StatementRow = (CustomerAccountEntry | SupplierAccountEntry) & { running_balance: number }
type Column<T> = { key: string; header: string; render: (row: T) => ReactNode }
type ResultState = { searched: boolean; rows: Record<string, unknown>[]; columns: Column<Record<string, unknown>>[]; summaries: SummaryCard[]; empty?: string }
type CommonTransactionFilter = { dateFrom: string; dateTo: string; service: string; currency: string }

const emptyResult: ResultState = { searched: false, rows: [], columns: [], summaries: [] }

const categories: { id: string; title: string; description: string; reports: ReportItem[] }[] = [
  {
    id: 'customers',
    title: 'تقارير العملاء',
    description: 'كشوفات حسابات العملاء، الديون، ومعاملات كل عميل.',
    reports: [
      { id: 'customer-statement', title: 'كشف حساب عميل', description: 'مدين ودائن ورصيد جاري حسب العملة.' },
      { id: 'customer-debts', title: 'ديون العملاء', description: 'أرصدة العملاء وآخر حركة.' },
      { id: 'customer-transactions', title: 'معاملات عميل', description: 'كل معاملات عميل محدد.' },
    ],
  },
  {
    id: 'suppliers',
    title: 'تقارير الموردين',
    description: 'كشوفات الموردين، الديون، ومعاملات المورد.',
    reports: [
      { id: 'supplier-statement', title: 'كشف حساب مورد', description: 'مدين ودائن ورصيد جاري حسب العملة.' },
      { id: 'supplier-debts', title: 'ديون الموردين', description: 'أرصدة الموردين وآخر حركة.' },
      { id: 'supplier-transactions', title: 'معاملات مورد', description: 'كل معاملات مورد محدد.' },
    ],
  },
  {
    id: 'transactions',
    title: 'تقارير الإصدارات / المعاملات',
    description: 'كشوفات المعاملات وتجميع الإصدارات.',
    reports: [
      { id: 'transactions-list', title: 'كشف المعاملات', description: 'بحث تفصيلي في كل المعاملات والتذاكر.' },
      { id: 'issuance-by-employee', title: 'إصدارات حسب الموظف', description: 'عدد وتكاليف وأسعار وربح حسب الموظف.' },
      { id: 'issuance-by-supplier', title: 'إصدارات حسب المورد', description: 'تجميع الإصدارات حسب المورد.' },
      { id: 'issuance-by-service', title: 'إصدارات حسب الخدمة', description: 'تجميع الإصدارات حسب الخدمة.' },
    ],
  },
  {
    id: 'flights',
    title: 'تقارير الرحلات',
    description: 'رحلات الذهاب والعودة والتذاكر الناقصة.',
    reports: [
      { id: 'upcoming-departures', title: 'الرحلات القادمة', description: 'رحلات الذهاب القادمة مع رسالة التذكير.' },
      { id: 'upcoming-returns', title: 'رحلات العودة القادمة', description: 'رحلات العودة القادمة مع رسالة التذكير.' },
      { id: 'tickets-missing-data', title: 'تذاكر بدون موعد رحلة', description: 'تذاكر ناقصة الحقول المهمة.' },
    ],
  },
  {
    id: 'financial',
    title: 'تقارير الأرباح والمالية',
    description: 'الأرباح والديون والحركات اليدوية.',
    reports: [
      { id: 'profit-total', title: 'إجمالي الأرباح', description: 'ربح متوقع وفعلي وعدد معاملات.' },
      { id: 'financial-summary', title: 'ملخص مالي', description: 'ديون العملاء والموردين والأرباح حسب العملة.' },
      { id: 'manual-entries', title: 'الحركات المالية اليدوية', description: 'قيود يدوية حسب النوع والاتجاه والمنشئ.' },
    ],
  },
  {
    id: 'employees',
    title: 'تقارير الموظفين',
    description: 'أداء الموظفين ومعاملات كل موظف.',
    reports: [
      { id: 'employee-performance', title: 'أداء الموظفين', description: 'عدد المعاملات والأسعار والتكاليف والربح.' },
      { id: 'employee-transactions', title: 'معاملات موظف', description: 'تفاصيل معاملات موظف محدد.' },
    ],
  },
]

const reportLookup = new Map(categories.flatMap((category) => category.reports.map((report) => [report.id, report])))

const initialFilters = {
  customerStatement: { customer: '', dateFrom: '', dateTo: '', currency: '' },
  supplierStatement: { supplier: '', dateFrom: '', dateTo: '', currency: '' },
  debts: { currency: '', positiveOnly: true, search: '' },
  customerTransactions: { customer: '', dateFrom: '', dateTo: '', service: '', currency: '' },
  supplierTransactions: { supplier: '', dateFrom: '', dateTo: '', service: '', currency: '' },
  transactions: { exactDate: '', dateFrom: '', dateTo: '', customer: '', supplier: '', service: '', currency: '', employee: '', createdBy: '', ticketNumber: '', pnr: '', customerType: '' },
  grouped: { employee: '', supplier: '', service: '', dateFrom: '', dateTo: '', currency: '' },
  flights: { mode: '30', dateFrom: '', dateTo: '', supplier: '', employee: '', customer: '', ticketNumber: '', pnr: '' },
  profit: { dateFrom: '', dateTo: '', currency: '', employee: '', supplier: '', service: '' },
  manualEntries: { party: '', entryType: '', direction: '', dateFrom: '', dateTo: '', currency: '', createdBy: '' },
  employeeTransactions: { employee: '', dateFrom: '', dateTo: '' },
}

function debit(entry: CustomerAccountEntry | SupplierAccountEntry) {
  return entry.direction === 'debit' ? Number(entry.amount) : 0
}

function credit(entry: CustomerAccountEntry | SupplierAccountEntry) {
  return entry.direction === 'credit' ? Number(entry.amount) : 0
}

function withRunning(entries: (CustomerAccountEntry | SupplierAccountEntry)[]) {
  const runningByCurrency = new Map<string, number>()
  return entries.map((entry) => {
    const running = (runningByCurrency.get(entry.currency) ?? 0) + debit(entry) - credit(entry)
    runningByCurrency.set(entry.currency, running)
    return { ...entry, running_balance: running }
  })
}

function entryLabel(type: string) {
  if (type === 'transaction_charge') return 'قيد معاملة'
  if (type === 'transaction_cost') return 'تكلفة معاملة'
  if (type === 'payment') return 'دفعة'
  if (type === 'opening_balance') return 'رصيد افتتاحي'
  if (type === 'manual_debt') return 'دين يدوي'
  if (type === 'manual_credit') return 'دائن يدوي / إيصال سالب'
  return 'تسوية'
}

function currencyTotals(rows: TransactionReportRow[]) {
  const map = new Map<string, { currency: string; count: number; supplier_cost: number; customer_price: number; profit: number }>()
  for (const row of rows) {
    const current = map.get(row.currency) ?? { currency: row.currency, count: 0, supplier_cost: 0, customer_price: 0, profit: 0 }
    current.count += 1
    current.supplier_cost += Number(row.supplier_cost)
    current.customer_price += Number(row.customer_price)
    current.profit += Number(row.expected_profit)
    map.set(row.currency, current)
  }
  return [...map.values()]
}

function groupedMoneyCards(title: string, rows: { currency: string; amount: number }[]) {
  return rows.map((row) => ({ title: `${title} ${row.currency}`, value: <AmountText value={row.amount} currency={row.currency} /> }))
}

function asRows<T extends Record<string, unknown>>(rows: T[]) {
  return rows as Record<string, unknown>[]
}

export function ReportsPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [openCategory, setOpenCategory] = useState('customers')
  const [activeReport, setActiveReport] = useState('customer-statement')
  const [filters, setFilters] = useState(initialFilters)
  const [result, setResult] = useState<ResultState>(emptyResult)
  const [messageRow, setMessageRow] = useState<TransactionReportRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
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

  const activeMeta = reportLookup.get(activeReport)

  function resetResult() {
    setResult(emptyResult)
    setError('')
    setSuccess('')
  }

  function selectReport(reportId: string) {
    setActiveReport(reportId)
    resetResult()
  }

  async function runReport(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setReportLoading(true)
    try {
      if (activeReport === 'customer-statement') await loadCustomerStatement()
      else if (activeReport === 'supplier-statement') await loadSupplierStatement()
      else if (activeReport === 'customer-debts') await loadDebts('customer')
      else if (activeReport === 'supplier-debts') await loadDebts('supplier')
      else if (activeReport === 'customer-transactions') await loadPartyTransactions('customer')
      else if (activeReport === 'supplier-transactions') await loadPartyTransactions('supplier')
      else if (activeReport === 'transactions-list') await loadTransactionsList()
      else if (activeReport === 'issuance-by-employee') await loadGroupedIssuance('employee')
      else if (activeReport === 'issuance-by-supplier') await loadGroupedIssuance('supplier')
      else if (activeReport === 'issuance-by-service') await loadGroupedIssuance('service')
      else if (activeReport === 'upcoming-departures') await loadFlights('departure')
      else if (activeReport === 'upcoming-returns') await loadFlights('return')
      else if (activeReport === 'tickets-missing-data') await loadTicketsMissingData()
      else if (activeReport === 'profit-total') await loadProfitTotal()
      else if (activeReport === 'financial-summary') await loadFinancialSummary()
      else if (activeReport === 'manual-entries') await loadManualEntries()
      else if (activeReport === 'employee-performance') await loadGroupedIssuance('employee-performance')
      else if (activeReport === 'employee-transactions') await loadEmployeeTransactions()
    } finally {
      setReportLoading(false)
    }
  }

  async function loadCustomerStatement() {
    const form = filters.customerStatement
    if (!form.customer) {
      setError('اختر العميل أولا.')
      setResult(emptyResult)
      return
    }
    let query = supabase.from('customer_account_entries').select('*, profiles(full_name), transactions(id, transaction_date)').eq('customer_id', form.customer).order('entry_date').order('created_at')
    if (form.dateFrom) query = query.gte('entry_date', form.dateFrom)
    if (form.dateTo) query = query.lte('entry_date', form.dateTo)
    if (form.currency) query = query.eq('currency', form.currency)
    const { data, error } = await query
    if (error) throw error
    const rows = withRunning((data ?? []) as CustomerAccountEntry[])
    const totals = statementSummary(rows, form.currency)
    setResult({ searched: true, rows: asRows(rows), summaries: totals, columns: statementColumns() })
  }

  async function loadSupplierStatement() {
    const form = filters.supplierStatement
    if (!form.supplier) {
      setError('اختر المورد أولا.')
      setResult(emptyResult)
      return
    }
    let query = supabase.from('supplier_account_entries').select('*, profiles(full_name), transactions(id, transaction_date)').eq('supplier_id', form.supplier).order('entry_date').order('created_at')
    if (form.dateFrom) query = query.gte('entry_date', form.dateFrom)
    if (form.dateTo) query = query.lte('entry_date', form.dateTo)
    if (form.currency) query = query.eq('currency', form.currency)
    const { data, error } = await query
    if (error) throw error
    const rows = withRunning((data ?? []) as SupplierAccountEntry[])
    const totals = statementSummary(rows, form.currency)
    setResult({ searched: true, rows: asRows(rows), summaries: totals, columns: statementColumns() })
  }

  function statementSummary(rows: StatementRow[], currencyFilter: string) {
    const currency = currencyFilter || rows[0]?.currency || 'LYD'
    return [
      { title: 'إجمالي المدين', value: <AmountText value={rows.reduce((sum, row) => sum + debit(row), 0)} currency={currency} /> },
      { title: 'إجمالي الدائن', value: <AmountText value={rows.reduce((sum, row) => sum + credit(row), 0)} currency={currency} /> },
      { title: 'الرصيد النهائي', value: <AmountText value={Number(rows.at(-1)?.running_balance ?? 0)} currency={currency} /> },
    ]
  }

  async function loadDebts(kind: 'customer' | 'supplier') {
    const form = filters.debts
    const [balanceRows, transactionRows] = await Promise.all([
      supabase.from(kind === 'customer' ? 'customer_balances_by_currency' : 'supplier_balances_by_currency').select('*'),
      supabase.from('transaction_report_view').select('*').order('transaction_date', { ascending: false }).limit(1000),
    ])
    if (balanceRows.error) throw balanceRows.error
    if (transactionRows.error) throw transactionRows.error

    const transactions = (transactionRows.data ?? []) as TransactionReportRow[]
    const rows = (balanceRows.data ?? []).filter((row) => {
      const balance = Number(row.balance)
      const name = String(row[kind === 'customer' ? 'customer_name' : 'supplier_name'] ?? '')
      if (form.currency && row.currency !== form.currency) return false
      if (form.positiveOnly && balance <= 0) return false
      if (form.search && !name.toLowerCase().includes(form.search.toLowerCase())) return false
      return true
    }).map((row) => {
      const id = String(row[kind === 'customer' ? 'customer_id' : 'supplier_id'])
      const party = kind === 'customer' ? customers.find((item) => item.id === id) : suppliers.find((item) => item.id === id)
      const latest = transactions.find((transaction) => kind === 'customer' ? transaction.customer_id === id : transaction.supplier_id === id)
      return {
        name: String(row[kind === 'customer' ? 'customer_name' : 'supplier_name']),
        phone: party?.phone ?? '',
        currency: String(row.currency),
        balance: Number(row.balance),
        last_transaction_date: latest?.transaction_date ?? '',
      }
    })

    setResult({
      searched: true,
      rows,
      summaries: groupedMoneyCards('إجمالي الرصيد', sumByCurrency(rows.map((row) => ({ currency: String(row.currency), amount: Number(row.balance) })))),
      columns: [
        { key: 'name', header: kind === 'customer' ? 'العميل' : 'المورد', render: (row) => String(row.name) },
        { key: 'phone', header: 'الهاتف', render: (row) => String(row.phone || '-') },
        { key: 'balance', header: 'الرصيد حسب العملة', render: (row) => <AmountText value={Number(row.balance)} currency={String(row.currency)} /> },
        { key: 'last', header: 'آخر معاملة', render: (row) => String(row.last_transaction_date || '-') },
      ],
    })
  }

  async function loadPartyTransactions(kind: 'customer' | 'supplier') {
    if (kind === 'customer' && !filters.customerTransactions.customer) {
      setError('اختر العميل أولا.')
      setResult(emptyResult)
      return
    }
    if (kind === 'supplier' && !filters.supplierTransactions.supplier) {
      setError('اختر المورد أولا.')
      setResult(emptyResult)
      return
    }
    const form: CommonTransactionFilter = kind === 'customer' ? filters.customerTransactions : filters.supplierTransactions
    let query = supabase.from('transaction_report_view').select('*').order('transaction_date', { ascending: false })
    query = kind === 'customer' ? query.eq('customer_id', filters.customerTransactions.customer) : query.eq('supplier_id', filters.supplierTransactions.supplier)
    if (form.dateFrom) query = query.gte('transaction_date', form.dateFrom)
    if (form.dateTo) query = query.lte('transaction_date', form.dateTo)
    if (form.service) query = query.eq('service_id', form.service)
    if (form.currency) query = query.eq('currency', form.currency)
    const { data, error } = await query.limit(500)
    if (error) throw error
    const rows = (data ?? []) as TransactionReportRow[]
    setTransactionResult(rows)
  }

  async function loadTransactionsList() {
    const form = filters.transactions
    const hasFilter = Object.values(form).some(Boolean)
    if (!hasFilter) {
      setError('اختر فلتر واحد على الأقل قبل البحث.')
      setResult(emptyResult)
      return
    }
    let query = supabase.from('transaction_report_view').select('*').order('transaction_date', { ascending: false })
    if (form.exactDate) query = query.eq('transaction_date', form.exactDate)
    if (form.dateFrom) query = query.gte('transaction_date', form.dateFrom)
    if (form.dateTo) query = query.lte('transaction_date', form.dateTo)
    if (form.customer) query = query.eq('customer_id', form.customer)
    if (form.supplier) query = query.eq('supplier_id', form.supplier)
    if (form.service) query = query.eq('service_id', form.service)
    if (form.currency) query = query.eq('currency', form.currency)
    if (form.employee) query = query.eq('employee_id', form.employee)
    if (form.createdBy) query = query.eq('created_by', form.createdBy)
    if (form.ticketNumber) query = query.ilike('ticket_number', `%${form.ticketNumber}%`)
    if (form.pnr) query = query.ilike('pnr', `%${form.pnr}%`)
    if (form.customerType) query = query.eq('customer_type', form.customerType)
    const { data, error } = await query.limit(500)
    if (error) throw error
    setTransactionResult((data ?? []) as TransactionReportRow[])
  }

  async function loadGroupedIssuance(kind: 'employee' | 'supplier' | 'service' | 'employee-performance') {
    const form = filters.grouped
    let query = supabase.from('transaction_report_view').select('*')
    if (form.dateFrom) query = query.gte('transaction_date', form.dateFrom)
    if (form.dateTo) query = query.lte('transaction_date', form.dateTo)
    if (form.currency) query = query.eq('currency', form.currency)
    if (kind === 'employee' && form.employee) query = query.eq('employee_id', form.employee)
    if (kind === 'supplier' && form.supplier) query = query.eq('supplier_id', form.supplier)
    if (kind === 'service' && form.service) query = query.eq('service_id', form.service)
    const { data, error } = await query.limit(1000)
    if (error) throw error
    const source = (data ?? []) as TransactionReportRow[]
    const grouped = new Map<string, { name: string; currency: string; count: number; supplier_cost: number; customer_price: number; profit: number }>()
    for (const row of source) {
      const id = kind === 'supplier' ? row.supplier_id : kind === 'service' ? row.service_id : row.employee_id ?? 'none'
      const name = kind === 'supplier' ? row.supplier_name : kind === 'service' ? row.service_name : row.employee_name ?? 'بدون موظف'
      const key = `${id}-${row.currency}`
      const current = grouped.get(key) ?? { name, currency: row.currency, count: 0, supplier_cost: 0, customer_price: 0, profit: 0 }
      current.count += 1
      current.supplier_cost += Number(row.supplier_cost)
      current.customer_price += Number(row.customer_price)
      current.profit += Number(row.expected_profit)
      grouped.set(key, current)
    }
    const rows = [...grouped.values()]
    setResult({
      searched: true,
      rows: asRows(rows),
      summaries: [{ title: 'عدد المعاملات', value: rows.reduce((sum, row) => sum + row.count, 0) }],
      columns: groupedColumns(kind === 'supplier' ? 'المورد' : kind === 'service' ? 'الخدمة' : 'الموظف'),
    })
  }

  async function loadFlights(dateKind: 'departure' | 'return') {
    const form = filters.flights
    let query = supabase.from('transaction_report_view').select('*').eq('service_type', 'ticket')
    const field = dateKind === 'departure' ? 'departure_date' : 'return_date'
    const range = flightRange(form.mode, form.dateFrom, form.dateTo)
    if (range.from) query = query.gte(field, range.from)
    if (range.to) query = query.lte(field, range.to)
    if (form.supplier) query = query.eq('supplier_id', form.supplier)
    if (form.employee) query = query.eq('employee_id', form.employee)
    if (form.ticketNumber) query = query.ilike('ticket_number', `%${form.ticketNumber}%`)
    if (form.pnr) query = query.ilike('pnr', `%${form.pnr}%`)
    const { data, error } = await query.limit(500)
    if (error) throw error
    const rows = ((data ?? []) as TransactionReportRow[]).filter((row) => !form.customer || `${row.customer_name ?? ''} ${row.guest_customer_name ?? ''}`.toLowerCase().includes(form.customer.toLowerCase()))
    setResult({ searched: true, rows: asRows(rows), summaries: [{ title: 'عدد الرحلات', value: rows.length }], columns: flightColumns() })
  }

  async function loadTicketsMissingData() {
    const { data, error } = await supabase.from('transaction_report_view').select('*').eq('service_type', 'ticket').limit(1000)
    if (error) throw error
    const rows = ((data ?? []) as TransactionReportRow[]).filter((row) => !row.departure_date || !row.ticket_number || !row.pnr || !routeSummary(row.route_segments))
    setResult({ searched: true, rows: asRows(rows), summaries: [{ title: 'عدد التذاكر الناقصة', value: rows.length }], columns: flightColumns() })
  }

  async function loadProfitTotal() {
    const form = filters.profit
    let query = supabase.from('transaction_report_view').select('*')
    if (form.dateFrom) query = query.gte('transaction_date', form.dateFrom)
    if (form.dateTo) query = query.lte('transaction_date', form.dateTo)
    if (form.currency) query = query.eq('currency', form.currency)
    if (form.employee) query = query.eq('employee_id', form.employee)
    if (form.supplier) query = query.eq('supplier_id', form.supplier)
    if (form.service) query = query.eq('service_id', form.service)
    const { data, error } = await query.limit(1000)
    if (error) throw error
    const transactions = (data ?? []) as TransactionReportRow[]
    const actual = await actualProfitRows(form.dateFrom, form.dateTo, form.currency)
    const expected = sumByCurrency(transactions.map((row) => ({ currency: row.currency, amount: Number(row.expected_profit) })))
    setResult({
      searched: true,
      rows: asRows(currencyTotals(transactions)),
      summaries: [
        { title: 'عدد المعاملات', value: transactions.length },
        ...groupedMoneyCards('الربح المتوقع', expected),
        ...groupedMoneyCards('الربح الفعلي', actual),
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
      ...sumByCurrency((customerBalances.data ?? []).map((row) => ({ currency: String(row.currency), amount: Number(row.balance) }))).map((row) => ({ type: 'ديون العملاء', ...row })),
      ...sumByCurrency((supplierBalances.data ?? []).map((row) => ({ currency: String(row.currency), amount: Number(row.balance) }))).map((row) => ({ type: 'ديون الموردين', ...row })),
      ...sumByCurrency(txRows.map((row) => ({ currency: row.currency, amount: Number(row.expected_profit) }))).map((row) => ({ type: 'الربح المتوقع', ...row })),
      ...actual.map((row) => ({ type: 'الربح الفعلي', ...row })),
    ]
    setResult({
      searched: true,
      rows: asRows(rows),
      summaries: [],
      columns: [
        { key: 'type', header: 'البند', render: (row) => String(row.type) },
        { key: 'currency', header: 'العملة', render: (row) => String(row.currency) },
        { key: 'amount', header: 'الإجمالي', render: (row) => <AmountText value={Number(row.amount)} currency={String(row.currency)} /> },
      ],
    })
  }

  async function loadManualEntries() {
    const form = filters.manualEntries
    const queries = []
    if (!form.party || form.party === 'customer') queries.push(loadManualEntriesFor('customer'))
    if (!form.party || form.party === 'supplier') queries.push(loadManualEntriesFor('supplier'))
    const rows = (await Promise.all(queries)).flat()
    setResult({ searched: true, rows: asRows(rows), summaries: [{ title: 'عدد القيود', value: rows.length }], columns: manualEntryColumns() })
  }

  async function loadManualEntriesFor(kind: 'customer' | 'supplier') {
    const form = filters.manualEntries
    let query = supabase.from(kind === 'customer' ? 'customer_account_entries' : 'supplier_account_entries').select(kind === 'customer' ? '*, customers(name), profiles(full_name)' : '*, suppliers(name), profiles(full_name)').in('entry_type', ['opening_balance', 'manual_debt', 'manual_credit', 'adjustment'])
    if (form.entryType) query = query.eq('entry_type', form.entryType)
    if (form.direction) query = query.eq('direction', form.direction)
    if (form.dateFrom) query = query.gte('entry_date', form.dateFrom)
    if (form.dateTo) query = query.lte('entry_date', form.dateTo)
    if (form.currency) query = query.eq('currency', form.currency)
    if (form.createdBy) query = query.eq('created_by', form.createdBy)
    const { data, error } = await query.limit(500)
    if (error) throw error
    return (data ?? []).map((row) => ({
      party_type: kind === 'customer' ? 'عميل' : 'مورد',
      party_name: kind === 'customer' ? row.customers?.name : row.suppliers?.name,
      entry_date: row.entry_date,
      entry_type: row.entry_type,
      direction: row.direction,
      amount: Number(row.amount),
      currency: row.currency,
      description: row.description,
      created_by_name: row.profiles?.full_name,
    }))
  }

  async function loadEmployeeTransactions() {
    const form = filters.employeeTransactions
    if (!form.employee) {
      setError('اختر الموظف أولا.')
      setResult(emptyResult)
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
      accountPaymentQuery('customer_account_entries', dateFrom, dateTo, currency),
      accountPaymentQuery('supplier_account_entries', dateFrom, dateTo, currency),
    ])
    const map = new Map<string, number>()
    for (const row of customerRows) map.set(row.currency, (map.get(row.currency) ?? 0) + (row.direction === 'credit' ? row.amount : -row.amount))
    for (const row of supplierRows) map.set(row.currency, (map.get(row.currency) ?? 0) - (row.direction === 'credit' ? row.amount : -row.amount))
    return [...map.entries()].map(([currency, amount]) => ({ currency, amount }))
  }

  async function accountPaymentQuery(table: 'customer_account_entries' | 'supplier_account_entries', dateFrom: string, dateTo: string, currency: string) {
    let query = supabase.from(table).select('currency, amount, direction').eq('entry_type', 'payment')
    if (dateFrom) query = query.gte('entry_date', dateFrom)
    if (dateTo) query = query.lte('entry_date', dateTo)
    if (currency) query = query.eq('currency', currency)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((row) => ({ currency: String(row.currency), amount: Number(row.amount), direction: String(row.direction) }))
  }

  function setTransactionResult(rows: TransactionReportRow[]) {
    const totals = currencyTotals(rows)
    setResult({
      searched: true,
      rows: asRows(rows),
      summaries: [
        { title: 'عدد المعاملات', value: rows.length },
        ...groupedMoneyCards('إجمالي الربح', totals.map((row) => ({ currency: row.currency, amount: row.profit }))),
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
    <section className="page">
      <div className="page-header"><h2>التقارير</h2></div>
      {error && <div className="error">{error}</div>}
      {success && <div className="status ok">{success}</div>}
      {reportLoading && <div className="loading">جاري تحميل التقرير...</div>}

      <div className="report-layout">
        <div className="page">
          {categories.map((category) => (
            <ReportCategoryAccordion
              key={category.id}
              title={category.title}
              description={category.description}
              reports={category.reports}
              open={openCategory === category.id}
              activeReport={activeReport}
              onToggle={() => setOpenCategory(openCategory === category.id ? '' : category.id)}
              onSelect={selectReport}
            />
          ))}
        </div>

        <ReportPanel title={activeMeta?.title ?? 'اختر تقرير'} description={activeMeta?.description ?? 'اختر تقريرا من القائمة.'}>
          <ReportFilterForm onSubmit={runReport} onReset={() => resetActiveFilters()}>
            {renderFilters()}
          </ReportFilterForm>
          <ReportSummaryCards cards={result.summaries} />
          {!result.searched && <div className="loading">اضبط الفلاتر ثم اضغط بحث لعرض النتائج.</div>}
          {result.searched && <ReportResultsTable rows={result.rows} columns={result.columns} empty={result.empty ?? 'لا توجد نتائج'} />}
        </ReportPanel>
      </div>

      {messageRow && <TicketMessageModal row={messageRow} onCopy={copyMessage} onClose={() => setMessageRow(null)} />}
    </section>
  )

  function resetActiveFilters() {
    if (activeReport === 'customer-statement') setFilters((current) => ({ ...current, customerStatement: initialFilters.customerStatement }))
    else if (activeReport === 'supplier-statement') setFilters((current) => ({ ...current, supplierStatement: initialFilters.supplierStatement }))
    else if (activeReport === 'customer-debts' || activeReport === 'supplier-debts') setFilters((current) => ({ ...current, debts: initialFilters.debts }))
    else if (activeReport === 'customer-transactions') setFilters((current) => ({ ...current, customerTransactions: initialFilters.customerTransactions }))
    else if (activeReport === 'supplier-transactions') setFilters((current) => ({ ...current, supplierTransactions: initialFilters.supplierTransactions }))
    else if (activeReport === 'transactions-list') setFilters((current) => ({ ...current, transactions: initialFilters.transactions }))
    else if (['issuance-by-employee', 'issuance-by-supplier', 'issuance-by-service', 'employee-performance'].includes(activeReport)) setFilters((current) => ({ ...current, grouped: initialFilters.grouped }))
    else if (['upcoming-departures', 'upcoming-returns', 'tickets-missing-data'].includes(activeReport)) setFilters((current) => ({ ...current, flights: initialFilters.flights }))
    else if (activeReport === 'profit-total') setFilters((current) => ({ ...current, profit: initialFilters.profit }))
    else if (activeReport === 'manual-entries') setFilters((current) => ({ ...current, manualEntries: initialFilters.manualEntries }))
    else if (activeReport === 'employee-transactions') setFilters((current) => ({ ...current, employeeTransactions: initialFilters.employeeTransactions }))
    resetResult()
  }

  function renderFilters() {
    if (activeReport === 'customer-statement') {
      const form = filters.customerStatement
      return <>
        <Select label="العميل" value={form.customer} onChange={(customer) => setFilters({ ...filters, customerStatement: { ...form, customer } })} options={customers.map((item) => [item.id, item.name])} />
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, customerStatement: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, customerStatement: { ...form, dateTo } })} />
        <CurrencyInput value={form.currency} onChange={(currency) => setFilters({ ...filters, customerStatement: { ...form, currency } })} />
      </>
    }
    if (activeReport === 'supplier-statement') {
      const form = filters.supplierStatement
      return <>
        <Select label="المورد" value={form.supplier} onChange={(supplier) => setFilters({ ...filters, supplierStatement: { ...form, supplier } })} options={suppliers.map((item) => [item.id, item.name])} />
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
        <Select label="العميل" value={form.customer} onChange={(customer) => setFilters({ ...filters, customerTransactions: { ...form, customer } })} options={customers.map((item) => [item.id, item.name])} />
        <CommonTransactionFilters form={form} setForm={(next) => setFilters({ ...filters, customerTransactions: { ...form, ...next } })} />
      </>
    }
    if (activeReport === 'supplier-transactions') {
      const form = filters.supplierTransactions
      return <>
        <Select label="المورد" value={form.supplier} onChange={(supplier) => setFilters({ ...filters, supplierTransactions: { ...form, supplier } })} options={suppliers.map((item) => [item.id, item.name])} />
        <CommonTransactionFilters form={form} setForm={(next) => setFilters({ ...filters, supplierTransactions: { ...form, ...next } })} />
      </>
    }
    if (activeReport === 'transactions-list') {
      const form = filters.transactions
      return <>
        <DateInput label="تاريخ محدد" value={form.exactDate} onChange={(exactDate) => setFilters({ ...filters, transactions: { ...form, exactDate } })} />
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, transactions: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, transactions: { ...form, dateTo } })} />
        <Select label="العميل" value={form.customer} onChange={(customer) => setFilters({ ...filters, transactions: { ...form, customer } })} options={customers.map((item) => [item.id, item.name])} />
        <Select label="المورد" value={form.supplier} onChange={(supplier) => setFilters({ ...filters, transactions: { ...form, supplier } })} options={suppliers.map((item) => [item.id, item.name])} />
        <Select label="الخدمة" value={form.service} onChange={(service) => setFilters({ ...filters, transactions: { ...form, service } })} options={services.map((item) => [item.id, item.name])} />
        <CurrencyInput value={form.currency} onChange={(currency) => setFilters({ ...filters, transactions: { ...form, currency } })} />
        <Select label="الموظف" value={form.employee} onChange={(employee) => setFilters({ ...filters, transactions: { ...form, employee } })} options={profiles.map((item) => [item.id, item.full_name])} />
        <Select label="أنشئ بواسطة" value={form.createdBy} onChange={(createdBy) => setFilters({ ...filters, transactions: { ...form, createdBy } })} options={profiles.map((item) => [item.id, item.full_name])} />
        <TextInput label="رقم التذكرة" value={form.ticketNumber} onChange={(ticketNumber) => setFilters({ ...filters, transactions: { ...form, ticketNumber } })} />
        <TextInput label="PNR" value={form.pnr} onChange={(pnr) => setFilters({ ...filters, transactions: { ...form, pnr } })} />
        <Select label="نوع العميل" value={form.customerType} onChange={(customerType) => setFilters({ ...filters, transactions: { ...form, customerType } })} options={[['saved', 'عميل محفوظ'], ['guest', 'عميل مؤقت']]} />
      </>
    }
    if (['issuance-by-employee', 'issuance-by-supplier', 'issuance-by-service', 'employee-performance'].includes(activeReport)) {
      const form = filters.grouped
      return <>
        {activeReport === 'issuance-by-employee' && <Select label="الموظف" value={form.employee} onChange={(employee) => setFilters({ ...filters, grouped: { ...form, employee } })} options={profiles.map((item) => [item.id, item.full_name])} />}
        {activeReport === 'issuance-by-supplier' && <Select label="المورد" value={form.supplier} onChange={(supplier) => setFilters({ ...filters, grouped: { ...form, supplier } })} options={suppliers.map((item) => [item.id, item.name])} />}
        {activeReport === 'issuance-by-service' && <Select label="الخدمة" value={form.service} onChange={(service) => setFilters({ ...filters, grouped: { ...form, service } })} options={services.map((item) => [item.id, item.name])} />}
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, grouped: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, grouped: { ...form, dateTo } })} />
        <CurrencyInput value={form.currency} onChange={(currency) => setFilters({ ...filters, grouped: { ...form, currency } })} />
      </>
    }
    if (['upcoming-departures', 'upcoming-returns', 'tickets-missing-data'].includes(activeReport)) {
      const form = filters.flights
      return <>
        {activeReport !== 'tickets-missing-data' && <Select label="النطاق" value={form.mode} onChange={(mode) => setFilters({ ...filters, flights: { ...form, mode } })} options={[['today', 'اليوم'], ['7', 'القادمة خلال 7 أيام'], ['30', 'القادمة خلال 30 يوم'], ['custom', 'نطاق مخصص']]} />}
        {form.mode === 'custom' && <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, flights: { ...form, dateFrom } })} />}
        {form.mode === 'custom' && <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, flights: { ...form, dateTo } })} />}
        <Select label="المورد" value={form.supplier} onChange={(supplier) => setFilters({ ...filters, flights: { ...form, supplier } })} options={suppliers.map((item) => [item.id, item.name])} />
        <Select label="الموظف" value={form.employee} onChange={(employee) => setFilters({ ...filters, flights: { ...form, employee } })} options={profiles.map((item) => [item.id, item.full_name])} />
        <TextInput label="العميل / العميل المؤقت" value={form.customer} onChange={(customer) => setFilters({ ...filters, flights: { ...form, customer } })} />
        <TextInput label="رقم التذكرة" value={form.ticketNumber} onChange={(ticketNumber) => setFilters({ ...filters, flights: { ...form, ticketNumber } })} />
        <TextInput label="PNR" value={form.pnr} onChange={(pnr) => setFilters({ ...filters, flights: { ...form, pnr } })} />
      </>
    }
    if (activeReport === 'profit-total') {
      const form = filters.profit
      return <>
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, profit: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, profit: { ...form, dateTo } })} />
        <CurrencyInput value={form.currency} onChange={(currency) => setFilters({ ...filters, profit: { ...form, currency } })} />
        <Select label="الموظف" value={form.employee} onChange={(employee) => setFilters({ ...filters, profit: { ...form, employee } })} options={profiles.map((item) => [item.id, item.full_name])} />
        <Select label="المورد" value={form.supplier} onChange={(supplier) => setFilters({ ...filters, profit: { ...form, supplier } })} options={suppliers.map((item) => [item.id, item.name])} />
        <Select label="الخدمة" value={form.service} onChange={(service) => setFilters({ ...filters, profit: { ...form, service } })} options={services.map((item) => [item.id, item.name])} />
      </>
    }
    if (activeReport === 'manual-entries') {
      const form = filters.manualEntries
      return <>
        <Select label="الطرف" value={form.party} onChange={(party) => setFilters({ ...filters, manualEntries: { ...form, party } })} options={[['customer', 'عميل'], ['supplier', 'مورد']]} />
        <Select label="نوع القيد" value={form.entryType} onChange={(entryType) => setFilters({ ...filters, manualEntries: { ...form, entryType } })} options={[['opening_balance', 'رصيد افتتاحي'], ['manual_debt', 'دين يدوي'], ['manual_credit', 'دائن يدوي'], ['adjustment', 'تسوية']]} />
        <Select label="الاتجاه" value={form.direction} onChange={(direction) => setFilters({ ...filters, manualEntries: { ...form, direction } })} options={[['debit', 'مدين'], ['credit', 'دائن']]} />
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, manualEntries: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, manualEntries: { ...form, dateTo } })} />
        <CurrencyInput value={form.currency} onChange={(currency) => setFilters({ ...filters, manualEntries: { ...form, currency } })} />
        <Select label="أنشئ بواسطة" value={form.createdBy} onChange={(createdBy) => setFilters({ ...filters, manualEntries: { ...form, createdBy } })} options={profiles.map((item) => [item.id, item.full_name])} />
      </>
    }
    if (activeReport === 'employee-transactions') {
      const form = filters.employeeTransactions
      return <>
        <Select label="الموظف" value={form.employee} onChange={(employee) => setFilters({ ...filters, employeeTransactions: { ...form, employee } })} options={profiles.map((item) => [item.id, item.full_name])} />
        <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setFilters({ ...filters, employeeTransactions: { ...form, dateFrom } })} />
        <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setFilters({ ...filters, employeeTransactions: { ...form, dateTo } })} />
      </>
    }
    return null
  }

  function CommonTransactionFilters({ form, setForm }: { form: CommonTransactionFilter; setForm: (next: CommonTransactionFilter) => void }) {
    return <>
      <DateInput label="من تاريخ" value={form.dateFrom} onChange={(dateFrom) => setForm({ ...form, dateFrom })} />
      <DateInput label="إلى تاريخ" value={form.dateTo} onChange={(dateTo) => setForm({ ...form, dateTo })} />
      <Select label="الخدمة" value={form.service} onChange={(service) => setForm({ ...form, service })} options={services.map((item) => [item.id, item.name])} />
      <CurrencyInput value={form.currency} onChange={(currency) => setForm({ ...form, currency })} />
    </>
  }

  function transactionColumns(): Column<Record<string, unknown>>[] {
    return [
      { key: 'transaction_date', header: 'تاريخ المعاملة', render: (row) => String(row.transaction_date ?? '') },
      { key: 'customer', header: 'العميل / المؤقت', render: (row) => String(row.customer_name ?? row.guest_customer_name ?? '') },
      { key: 'supplier', header: 'المورد', render: (row) => String(row.supplier_name ?? '') },
      { key: 'service', header: 'الخدمة', render: (row) => String(row.service_name ?? '') },
      { key: 'ticket', header: 'رقم التذكرة', render: (row) => String(row.ticket_number ?? '-') },
      { key: 'pnr', header: 'PNR', render: (row) => String(row.pnr ?? '-') },
      { key: 'route', header: 'خط السير', render: (row) => routeSummary(row.route_segments) || '-' },
      { key: 'supplier_cost', header: 'تكلفة المورد', render: (row) => <AmountText value={Number(row.supplier_cost)} currency={String(row.currency)} /> },
      { key: 'customer_price', header: 'سعر العميل', render: (row) => <AmountText value={Number(row.customer_price)} currency={String(row.currency)} /> },
      { key: 'profit', header: 'الربح', render: (row) => <AmountText value={Number(row.expected_profit)} currency={String(row.currency)} /> },
      { key: 'currency', header: 'العملة', render: (row) => String(row.currency ?? '') },
      { key: 'employee', header: 'الموظف', render: (row) => String(row.employee_name ?? '') },
      { key: 'created_by', header: 'أنشئ بواسطة', render: (row) => String(row.created_by_name ?? '') },
      { key: 'created_at', header: 'وقت الإنشاء', render: (row) => String(row.created_at ?? '') },
    ]
  }

  function statementColumns(): Column<Record<string, unknown>>[] {
    return [
      { key: 'date', header: 'التاريخ', render: (row) => String(row.entry_date ?? '') },
      { key: 'type', header: 'نوع القيد', render: (row) => entryLabel(String(row.entry_type ?? '')) },
      { key: 'description', header: 'الوصف', render: (row) => String(row.description ?? '') },
      { key: 'debit', header: 'مدين', render: (row) => <AmountText value={String(row.direction) === 'debit' ? Number(row.amount) : 0} currency={String(row.currency)} /> },
      { key: 'credit', header: 'دائن', render: (row) => <AmountText value={String(row.direction) === 'credit' ? Number(row.amount) : 0} currency={String(row.currency)} /> },
      { key: 'balance', header: 'الرصيد الجاري', render: (row) => <AmountText value={Number(row.running_balance)} currency={String(row.currency)} /> },
      { key: 'currency', header: 'العملة', render: (row) => String(row.currency ?? '') },
      { key: 'created_by', header: 'أنشئ بواسطة', render: (row) => String((row.profiles as { full_name?: string } | undefined)?.full_name ?? '') },
      { key: 'transaction', header: 'المعاملة', render: (row) => row.transaction_id ? String(row.transaction_id).slice(0, 8) : '-' },
    ]
  }

  function flightColumns(): Column<Record<string, unknown>>[] {
    return [
      { key: 'customer', header: 'العميل', render: (row) => String(row.customer_name ?? '') },
      { key: 'phone', header: 'الهاتف', render: (row) => customerDisplayPhone(row as TransactionReportRow) || '-' },
      { key: 'route', header: 'خط السير', render: (row) => routeSummary(row.route_segments) || '-' },
      { key: 'ticket', header: 'رقم التذكرة', render: (row) => String(row.ticket_number ?? '-') },
      { key: 'pnr', header: 'PNR', render: (row) => String(row.pnr ?? '-') },
      { key: 'departure', header: 'الذهاب', render: (row) => [row.departure_date, row.departure_time].filter(Boolean).join(' ') || '-' },
      { key: 'return', header: 'العودة', render: (row) => [row.return_date, row.return_time].filter(Boolean).join(' ') || '-' },
      { key: 'supplier', header: 'المورد', render: (row) => String(row.supplier_name ?? '') },
      { key: 'employee', header: 'الموظف', render: (row) => String(row.employee_name ?? '') },
      { key: 'message', header: 'الرسالة', render: (row) => <button className="secondary" onClick={() => setMessageRow(row as TransactionReportRow)}>معاينة الرسالة</button> },
    ]
  }
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

function sumByCurrency(rows: { currency: string; amount: number }[]) {
  const map = new Map<string, number>()
  for (const row of rows) map.set(row.currency, (map.get(row.currency) ?? 0) + row.amount)
  return [...map.entries()].map(([currency, amount]) => ({ currency, amount }))
}

function groupedColumns(nameHeader: string, currencyAsName = false): Column<Record<string, unknown>>[] {
  return [
    { key: 'name', header: nameHeader, render: (row) => String(currencyAsName ? row.currency : row.name) },
    { key: 'currency', header: 'العملة', render: (row) => String(row.currency ?? '') },
    { key: 'count', header: 'عدد المعاملات', render: (row) => Number(row.count ?? 0) },
    { key: 'supplier_cost', header: 'إجمالي تكلفة المورد', render: (row) => <AmountText value={Number(row.supplier_cost)} currency={String(row.currency)} /> },
    { key: 'customer_price', header: 'إجمالي سعر العميل', render: (row) => <AmountText value={Number(row.customer_price)} currency={String(row.currency)} /> },
    { key: 'profit', header: 'الربح المتوقع', render: (row) => <AmountText value={Number(row.profit)} currency={String(row.currency)} /> },
  ]
}

function manualEntryColumns(): Column<Record<string, unknown>>[] {
  return [
    { key: 'party_type', header: 'الطرف', render: (row) => String(row.party_type ?? '') },
    { key: 'party_name', header: 'الاسم', render: (row) => String(row.party_name ?? '') },
    { key: 'date', header: 'التاريخ', render: (row) => String(row.entry_date ?? '') },
    { key: 'type', header: 'نوع القيد', render: (row) => entryLabel(String(row.entry_type ?? '')) },
    { key: 'direction', header: 'الاتجاه', render: (row) => String(row.direction) === 'debit' ? 'مدين' : 'دائن' },
    { key: 'amount', header: 'المبلغ', render: (row) => <AmountText value={Number(row.amount)} currency={String(row.currency)} /> },
    { key: 'description', header: 'الوصف', render: (row) => String(row.description ?? '') },
    { key: 'created_by', header: 'أنشئ بواسطة', render: (row) => String(row.created_by_name ?? '') },
  ]
}

function flightRange(mode: string, dateFrom: string, dateTo: string) {
  const start = today()
  if (mode === 'today') return { from: start, to: start }
  if (mode === '7' || mode === '30') {
    const date = new Date()
    date.setDate(date.getDate() + Number(mode))
    return { from: start, to: date.toISOString().slice(0, 10) }
  }
  if (mode === 'custom') return { from: dateFrom, to: dateTo }
  return { from: start, to: '' }
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
