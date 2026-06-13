import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { DataTable } from '../../components/ui/DataTable'
import { supabase } from '../../lib/supabase'
import { AmountText } from '../../components/ui/AmountText'
import { routeSummary } from '../../utils/tickets'
import type { Customer, CustomerAccountEntry, Profile, Service, Supplier, SupplierAccountEntry, TransactionReportRow } from '../../types/models'

type StatementRow = (CustomerAccountEntry | SupplierAccountEntry) & { running_balance: number }

const emptyTransactionFilters = {
  exactDate: '',
  dateFrom: '',
  dateTo: '',
  customer: '',
  supplier: '',
  service: '',
  currency: '',
  employee: '',
  createdBy: '',
  ticketNumber: '',
  pnr: '',
  departureFrom: '',
  departureTo: '',
  returnFrom: '',
  returnTo: '',
  customerType: '',
}

function entryLabel(type: string) {
  if (type === 'opening_balance') return 'رصيد افتتاحي'
  if (type === 'manual_debt') return 'دين يدوي'
  if (type === 'manual_credit') return 'دائن يدوي / إيصال سالب'
  if (type === 'transaction_charge') return 'قيد معاملة'
  if (type === 'transaction_cost') return 'تكلفة معاملة'
  if (type === 'payment') return 'دفعة'
  return 'تسوية'
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

function groupedTotals(rows: TransactionReportRow[]) {
  const map = new Map<string, { currency: string; supplier_cost: number; customer_price: number; profit: number }>()
  for (const row of rows) {
    const current = map.get(row.currency) ?? { currency: row.currency, supplier_cost: 0, customer_price: 0, profit: 0 }
    current.supplier_cost += Number(row.supplier_cost)
    current.customer_price += Number(row.customer_price)
    current.profit += Number(row.expected_profit)
    map.set(row.currency, current)
  }
  return [...map.values()]
}

export function ReportsPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [customerForm, setCustomerForm] = useState({ customer: '', dateFrom: '', dateTo: '', currency: '' })
  const [supplierForm, setSupplierForm] = useState({ supplier: '', dateFrom: '', dateTo: '', currency: '' })
  const [transactionFilters, setTransactionFilters] = useState(emptyTransactionFilters)
  const [customerStatement, setCustomerStatement] = useState<StatementRow[]>([])
  const [supplierStatement, setSupplierStatement] = useState<StatementRow[]>([])
  const [transactions, setTransactions] = useState<TransactionReportRow[]>([])
  const [selectedCustomerName, setSelectedCustomerName] = useState('')
  const [selectedSupplierName, setSelectedSupplierName] = useState('')
  const [searchedTransactions, setSearchedTransactions] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

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

  async function loadCustomerStatement(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setCustomerStatement([])
    if (!customerForm.customer) {
      setError('اختر العميل أولا.')
      return
    }
    setReportLoading(true)
    let query = supabase
      .from('customer_account_entries')
      .select('*, profiles(full_name), transactions(id, transaction_date)')
      .eq('customer_id', customerForm.customer)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (customerForm.dateFrom) query = query.gte('entry_date', customerForm.dateFrom)
    if (customerForm.dateTo) query = query.lte('entry_date', customerForm.dateTo)
    if (customerForm.currency) query = query.eq('currency', customerForm.currency)
    const { data, error } = await query
    if (error) setError(error.message)
    setSelectedCustomerName(customers.find((item) => item.id === customerForm.customer)?.name ?? '')
    setCustomerStatement(withRunning((data ?? []) as CustomerAccountEntry[]))
    setReportLoading(false)
  }

  async function loadSupplierStatement(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSupplierStatement([])
    if (!supplierForm.supplier) {
      setError('اختر المورد أولا.')
      return
    }
    setReportLoading(true)
    let query = supabase
      .from('supplier_account_entries')
      .select('*, profiles(full_name), transactions(id, transaction_date)')
      .eq('supplier_id', supplierForm.supplier)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (supplierForm.dateFrom) query = query.gte('entry_date', supplierForm.dateFrom)
    if (supplierForm.dateTo) query = query.lte('entry_date', supplierForm.dateTo)
    if (supplierForm.currency) query = query.eq('currency', supplierForm.currency)
    const { data, error } = await query
    if (error) setError(error.message)
    setSelectedSupplierName(suppliers.find((item) => item.id === supplierForm.supplier)?.name ?? '')
    setSupplierStatement(withRunning((data ?? []) as SupplierAccountEntry[]))
    setReportLoading(false)
  }

  async function searchTransactions(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setTransactions([])
    setSearchedTransactions(true)
    const hasFilter = Object.values(transactionFilters).some(Boolean)
    if (!hasFilter) {
      setMessage('اختر فلتر واحد على الأقل أو نطاق تاريخ قبل البحث.')
      return
    }
    setReportLoading(true)
    let query = supabase.from('transaction_report_view').select('*').order('transaction_date', { ascending: false })
    if (transactionFilters.exactDate) query = query.eq('transaction_date', transactionFilters.exactDate)
    if (transactionFilters.dateFrom) query = query.gte('transaction_date', transactionFilters.dateFrom)
    if (transactionFilters.dateTo) query = query.lte('transaction_date', transactionFilters.dateTo)
    if (transactionFilters.customer) query = query.eq('customer_id', transactionFilters.customer)
    if (transactionFilters.supplier) query = query.eq('supplier_id', transactionFilters.supplier)
    if (transactionFilters.service) query = query.eq('service_id', transactionFilters.service)
    if (transactionFilters.currency) query = query.eq('currency', transactionFilters.currency)
    if (transactionFilters.employee) query = query.eq('employee_id', transactionFilters.employee)
    if (transactionFilters.createdBy) query = query.eq('created_by', transactionFilters.createdBy)
    if (transactionFilters.ticketNumber) query = query.ilike('ticket_number', `%${transactionFilters.ticketNumber}%`)
    if (transactionFilters.pnr) query = query.ilike('pnr', `%${transactionFilters.pnr}%`)
    if (transactionFilters.departureFrom) query = query.gte('departure_date', transactionFilters.departureFrom)
    if (transactionFilters.departureTo) query = query.lte('departure_date', transactionFilters.departureTo)
    if (transactionFilters.returnFrom) query = query.gte('return_date', transactionFilters.returnFrom)
    if (transactionFilters.returnTo) query = query.lte('return_date', transactionFilters.returnTo)
    if (transactionFilters.customerType) query = query.eq('customer_type', transactionFilters.customerType)
    const { data, error } = await query.limit(500)
    if (error) setError(error.message)
    setTransactions((data ?? []) as TransactionReportRow[])
    setReportLoading(false)
  }

  const customerTotals = useMemo(() => ({
    debit: customerStatement.reduce((sum, row) => sum + debit(row), 0),
    credit: customerStatement.reduce((sum, row) => sum + credit(row), 0),
    balance: customerStatement.at(-1)?.running_balance ?? 0,
    currency: customerForm.currency || customerStatement[0]?.currency || 'LYD',
  }), [customerForm.currency, customerStatement])

  const supplierTotals = useMemo(() => ({
    debit: supplierStatement.reduce((sum, row) => sum + debit(row), 0),
    credit: supplierStatement.reduce((sum, row) => sum + credit(row), 0),
    balance: supplierStatement.at(-1)?.running_balance ?? 0,
    currency: supplierForm.currency || supplierStatement[0]?.currency || 'LYD',
  }), [supplierForm.currency, supplierStatement])

  if (loading) return <div className="loading">جاري تحميل التقارير...</div>

  return (
    <section className="page">
      <div className="page-header"><h2>التقارير</h2></div>
      {error && <div className="error">{error}</div>}
      {message && <div className="loading">{message}</div>}
      {reportLoading && <div className="loading">جاري تحميل التقرير...</div>}

      <section className="card">
        <h3>كشف حساب عميل</h3>
        <form className="form-grid" onSubmit={loadCustomerStatement}>
          <label>العميل<select value={customerForm.customer} onChange={(event) => setCustomerForm({ ...customerForm, customer: event.target.value })}><option value="">اختر العميل</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>من تاريخ<input type="date" value={customerForm.dateFrom} onChange={(event) => setCustomerForm({ ...customerForm, dateFrom: event.target.value })} /></label>
          <label>إلى تاريخ<input type="date" value={customerForm.dateTo} onChange={(event) => setCustomerForm({ ...customerForm, dateTo: event.target.value })} /></label>
          <label>العملة<select value={customerForm.currency} onChange={(event) => setCustomerForm({ ...customerForm, currency: event.target.value })}><option value="">كل العملات</option><option>LYD</option><option>USD</option><option>EUR</option></select></label>
          <div className="actions"><button>عرض كشف الحساب</button><button type="button" className="secondary" onClick={() => { setCustomerForm({ customer: '', dateFrom: '', dateTo: '', currency: '' }); setCustomerStatement([]); setSelectedCustomerName('') }}>مسح</button></div>
        </form>
        {selectedCustomerName && <h3>العميل: {selectedCustomerName}</h3>}
        {customerStatement.length > 0 && (
          <>
            <div className="grid">
              <div className="status">إجمالي المدين: <AmountText value={customerTotals.debit} currency={customerTotals.currency} /></div>
              <div className="status">إجمالي الدائن: <AmountText value={customerTotals.credit} currency={customerTotals.currency} /></div>
              <div className="status">الرصيد النهائي: <AmountText value={customerTotals.balance} currency={customerTotals.currency} /></div>
            </div>
            <StatementTable rows={customerStatement} />
          </>
        )}
      </section>

      <section className="card">
        <h3>كشف حساب مورد</h3>
        <form className="form-grid" onSubmit={loadSupplierStatement}>
          <label>المورد<select value={supplierForm.supplier} onChange={(event) => setSupplierForm({ ...supplierForm, supplier: event.target.value })}><option value="">اختر المورد</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>من تاريخ<input type="date" value={supplierForm.dateFrom} onChange={(event) => setSupplierForm({ ...supplierForm, dateFrom: event.target.value })} /></label>
          <label>إلى تاريخ<input type="date" value={supplierForm.dateTo} onChange={(event) => setSupplierForm({ ...supplierForm, dateTo: event.target.value })} /></label>
          <label>العملة<select value={supplierForm.currency} onChange={(event) => setSupplierForm({ ...supplierForm, currency: event.target.value })}><option value="">كل العملات</option><option>LYD</option><option>USD</option><option>EUR</option></select></label>
          <div className="actions"><button>عرض كشف الحساب</button><button type="button" className="secondary" onClick={() => { setSupplierForm({ supplier: '', dateFrom: '', dateTo: '', currency: '' }); setSupplierStatement([]); setSelectedSupplierName('') }}>مسح</button></div>
        </form>
        {selectedSupplierName && <h3>المورد: {selectedSupplierName}</h3>}
        {supplierStatement.length > 0 && (
          <>
            <div className="grid">
              <div className="status">إجمالي المدين: <AmountText value={supplierTotals.debit} currency={supplierTotals.currency} /></div>
              <div className="status">إجمالي الدائن: <AmountText value={supplierTotals.credit} currency={supplierTotals.currency} /></div>
              <div className="status">الرصيد النهائي: <AmountText value={supplierTotals.balance} currency={supplierTotals.currency} /></div>
            </div>
            <StatementTable rows={supplierStatement} />
          </>
        )}
      </section>

      <section className="card">
        <h3>تقرير المعاملات</h3>
        <form className="form-grid" onSubmit={searchTransactions}>
          <label>تاريخ محدد<input type="date" value={transactionFilters.exactDate} onChange={(event) => setTransactionFilters({ ...transactionFilters, exactDate: event.target.value })} /></label>
          <label>من تاريخ<input type="date" value={transactionFilters.dateFrom} onChange={(event) => setTransactionFilters({ ...transactionFilters, dateFrom: event.target.value })} /></label>
          <label>إلى تاريخ<input type="date" value={transactionFilters.dateTo} onChange={(event) => setTransactionFilters({ ...transactionFilters, dateTo: event.target.value })} /></label>
          <label>العميل<select value={transactionFilters.customer} onChange={(event) => setTransactionFilters({ ...transactionFilters, customer: event.target.value })}><option value="">كل العملاء المحفوظين</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>نوع العميل<select value={transactionFilters.customerType} onChange={(event) => setTransactionFilters({ ...transactionFilters, customerType: event.target.value })}><option value="">الكل</option><option value="saved">عميل محفوظ</option><option value="guest">عميل مؤقت</option></select></label>
          <label>المورد<select value={transactionFilters.supplier} onChange={(event) => setTransactionFilters({ ...transactionFilters, supplier: event.target.value })}><option value="">كل الموردين</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>الخدمة<select value={transactionFilters.service} onChange={(event) => setTransactionFilters({ ...transactionFilters, service: event.target.value })}><option value="">كل الخدمات</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>العملة<select value={transactionFilters.currency} onChange={(event) => setTransactionFilters({ ...transactionFilters, currency: event.target.value })}><option value="">كل العملات</option><option>LYD</option><option>USD</option><option>EUR</option></select></label>
          <label>الموظف<select value={transactionFilters.employee} onChange={(event) => setTransactionFilters({ ...transactionFilters, employee: event.target.value })}><option value="">كل الموظفين</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
          <label>أنشئ بواسطة<select value={transactionFilters.createdBy} onChange={(event) => setTransactionFilters({ ...transactionFilters, createdBy: event.target.value })}><option value="">الكل</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
          <label>رقم التذكرة<input value={transactionFilters.ticketNumber} onChange={(event) => setTransactionFilters({ ...transactionFilters, ticketNumber: event.target.value })} /></label>
          <label>PNR<input value={transactionFilters.pnr} onChange={(event) => setTransactionFilters({ ...transactionFilters, pnr: event.target.value })} /></label>
          <label>ذهاب من<input type="date" value={transactionFilters.departureFrom} onChange={(event) => setTransactionFilters({ ...transactionFilters, departureFrom: event.target.value })} /></label>
          <label>ذهاب إلى<input type="date" value={transactionFilters.departureTo} onChange={(event) => setTransactionFilters({ ...transactionFilters, departureTo: event.target.value })} /></label>
          <label>عودة من<input type="date" value={transactionFilters.returnFrom} onChange={(event) => setTransactionFilters({ ...transactionFilters, returnFrom: event.target.value })} /></label>
          <label>عودة إلى<input type="date" value={transactionFilters.returnTo} onChange={(event) => setTransactionFilters({ ...transactionFilters, returnTo: event.target.value })} /></label>
          <div className="actions"><button>بحث</button><button type="button" className="secondary" onClick={() => { setTransactionFilters(emptyTransactionFilters); setTransactions([]); setSearchedTransactions(false); setMessage('') }}>مسح الفلاتر</button></div>
        </form>
        {!searchedTransactions && <div className="loading">اختر فلاتر أو نطاق تاريخ ثم اضغط بحث.</div>}
        {transactions.length > 0 && <TransactionTotals rows={transactions} />}
        {searchedTransactions && (
          <DataTable rows={transactions} empty="لا توجد نتائج" columns={[
            { key: 'date', header: 'تاريخ المعاملة', render: (row) => row.transaction_date },
            { key: 'customer_type', header: 'نوع العميل', render: (row) => row.customer_type === 'guest' ? 'عميل مؤقت' : 'عميل محفوظ' },
            { key: 'customer', header: 'العميل', render: (row) => row.customer_name },
            { key: 'guest', header: 'اسم العميل المؤقت', render: (row) => row.guest_customer_name ?? '-' },
            { key: 'supplier', header: 'المورد', render: (row) => row.supplier_name },
            { key: 'service', header: 'الخدمة', render: (row) => row.service_name },
            { key: 'ticket', header: 'رقم التذكرة', render: (row) => row.ticket_number ?? '-' },
            { key: 'pnr', header: 'PNR', render: (row) => row.pnr ?? '-' },
            { key: 'route', header: 'خط السير', render: (row) => routeSummary(row.route_segments) || '-' },
            { key: 'departure', header: 'تاريخ الذهاب', render: (row) => row.departure_date ?? '-' },
            { key: 'return', header: 'تاريخ العودة', render: (row) => row.return_date ?? '-' },
            { key: 'supplier_cost', header: 'تكلفة المورد', render: (row) => <AmountText value={Number(row.supplier_cost)} currency={row.currency} /> },
            { key: 'customer_price', header: 'سعر العميل', render: (row) => <AmountText value={Number(row.customer_price)} currency={row.currency} /> },
            { key: 'profit', header: 'الربح', render: (row) => <AmountText value={Number(row.expected_profit)} currency={row.currency} /> },
            { key: 'currency', header: 'العملة', render: (row) => row.currency },
            { key: 'employee', header: 'الموظف', render: (row) => row.employee_name ?? '' },
            { key: 'created_by', header: 'أنشئ بواسطة', render: (row) => row.created_by_name ?? '' },
          ]} />
        )}
      </section>
    </section>
  )
}

function StatementTable({ rows }: { rows: StatementRow[] }) {
  return (
    <DataTable rows={rows} columns={[
      { key: 'date', header: 'التاريخ', render: (row) => row.entry_date },
      { key: 'type', header: 'نوع القيد', render: (row) => entryLabel(row.entry_type) },
      { key: 'description', header: 'الوصف', render: (row) => row.description ?? '' },
      { key: 'debit', header: 'مدين', render: (row) => <AmountText value={debit(row)} currency={row.currency} /> },
      { key: 'credit', header: 'دائن', render: (row) => <AmountText value={credit(row)} currency={row.currency} /> },
      { key: 'balance', header: 'الرصيد الجاري', render: (row) => <AmountText value={row.running_balance} currency={row.currency} /> },
      { key: 'currency', header: 'العملة', render: (row) => row.currency },
      { key: 'created_by', header: 'أنشئ بواسطة', render: (row) => row.profiles?.full_name ?? '' },
      { key: 'transaction', header: 'المعاملة', render: (row) => row.transaction_id ? row.transaction_id.slice(0, 8) : '-' },
    ]} />
  )
}

function TransactionTotals({ rows }: { rows: TransactionReportRow[] }) {
  return (
    <DataTable rows={groupedTotals(rows)} columns={[
      { key: 'currency', header: 'العملة', render: (row) => row.currency },
      { key: 'supplier_cost', header: 'إجمالي تكلفة المورد', render: (row) => <AmountText value={row.supplier_cost} currency={row.currency} /> },
      { key: 'customer_price', header: 'إجمالي سعر العميل', render: (row) => <AmountText value={row.customer_price} currency={row.currency} /> },
      { key: 'profit', header: 'إجمالي الربح المتوقع', render: (row) => <AmountText value={row.profit} currency={row.currency} /> },
    ]} />
  )
}
