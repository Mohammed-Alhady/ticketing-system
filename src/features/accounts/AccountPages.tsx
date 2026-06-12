import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DataTable } from '../../components/ui/DataTable'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { canCreateOperationalRecords, canMutateRecords } from '../../lib/permissions'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { FormModal } from '../../components/ui/FormModal'
import { today } from '../../utils/dates'
import { money } from '../../utils/money'
import type {
  Customer,
  CustomerAccountEntry,
  CustomerBalance,
  Supplier,
  SupplierAccountEntry,
  SupplierBalance,
  TransactionSummary,
} from '../../types/models'

type AccountKind = 'customer' | 'supplier'
type Party = Customer | Supplier
type Entry = CustomerAccountEntry | SupplierAccountEntry
type Balance = CustomerBalance | SupplierBalance

const labels = {
  customer: {
    title: 'حسابات العملاء',
    detailTitle: 'كشف حساب العميل',
    party: 'العميل',
    listPath: '/customer-accounts',
    idParam: 'customerId',
    partiesTable: 'customers',
    entriesTable: 'customer_account_entries',
    balanceView: 'customer_balances_by_currency',
    partyKey: 'customer_id',
    nameKey: 'customer_name',
    linkBase: '/customer-accounts',
    paymentButton: 'إضافة دفعة عميل',
  },
  supplier: {
    title: 'حسابات الموردين',
    detailTitle: 'كشف حساب المورد',
    party: 'المورد',
    listPath: '/supplier-accounts',
    idParam: 'supplierId',
    partiesTable: 'suppliers',
    entriesTable: 'supplier_account_entries',
    balanceView: 'supplier_balances_by_currency',
    partyKey: 'supplier_id',
    nameKey: 'supplier_name',
    linkBase: '/supplier-accounts',
    paymentButton: 'إضافة دفعة مورد',
  },
} as const

function entrySign(entry: Entry) {
  return entry.entry_type === 'payment' ? -Number(entry.amount) : Number(entry.amount)
}

function entryDebit(entry: Entry) {
  return entry.entry_type === 'payment' ? 0 : Number(entry.amount)
}

function entryCredit(entry: Entry) {
  return entry.entry_type === 'payment' ? Number(entry.amount) : 0
}

function typeLabel(type: string) {
  if (type === 'transaction_charge') return 'قيد معاملة'
  if (type === 'transaction_cost') return 'تكلفة معاملة'
  if (type === 'payment') return 'دفعة'
  return 'تسوية'
}

export function AccountPage({ type }: { type: AccountKind }) {
  const config = labels[type]
  const params = useParams()
  const selectedId = params[config.idParam]
  const { profile } = useAuth()
  const admin = canMutateRecords(profile)
  const [parties, setParties] = useState<Party[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [transactions, setTransactions] = useState<TransactionSummary[]>([])
  const [form, setForm] = useState({
    party_id: selectedId ?? '',
    amount: '',
    currency: 'LYD',
    entry_date: today(),
    description: '',
    transaction_id: '',
  })
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', currency: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [deleting, setDeleting] = useState<Entry | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const entryQuery = supabase
      .from(config.entriesTable)
      .select('*, profiles(full_name), transactions(id, transaction_date)')
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (selectedId) entryQuery.eq(config.partyKey, selectedId)
    if (filters.dateFrom) entryQuery.gte('entry_date', filters.dateFrom)
    if (filters.dateTo) entryQuery.lte('entry_date', filters.dateTo)
    if (filters.currency) entryQuery.eq('currency', filters.currency)

    const [partyRows, balanceRows, entryRows, transactionRows] = await Promise.all([
      supabase.from(config.partiesTable).select('*').order('name'),
      supabase.from(config.balanceView).select('*').order(config.nameKey),
      entryQuery,
      supabase.from('transaction_summary').select('*').order('transaction_date', { ascending: false }),
    ])

    const firstError = partyRows.error ?? balanceRows.error ?? entryRows.error ?? transactionRows.error
    if (firstError) setError(firstError.message)
    setParties((partyRows.data ?? []) as Party[])
    setBalances((balanceRows.data ?? []) as Balance[])
    setEntries((entryRows.data ?? []) as Entry[])
    setTransactions((transactionRows.data ?? []) as TransactionSummary[])
    setLoading(false)
  }, [config.balanceView, config.entriesTable, config.nameKey, config.partiesTable, config.partyKey, filters.currency, filters.dateFrom, filters.dateTo, selectedId])

  useEffect(() => {
    setForm((current) => ({ ...current, party_id: selectedId ?? current.party_id }))
  }, [selectedId])

  useEffect(() => {
    load()
  }, [load])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!form.party_id || !form.amount) {
      setError(`${config.party} والمبلغ مطلوبان.`)
      return
    }

    const payload = {
      [config.partyKey]: form.party_id,
      entry_date: form.entry_date,
      entry_type: 'payment',
      amount: Number(form.amount),
      currency: form.currency,
      description: form.description || null,
      transaction_id: form.transaction_id || null,
      created_by: profile?.id,
    }

    const result = editing
      ? await supabase.from(config.entriesTable).update(payload).eq('id', editing.id)
      : await supabase.from(config.entriesTable).insert(payload)
    const { error } = result
    if (error) setError(error.message)
    else {
      setSuccess(editing ? 'تم حفظ التعديل.' : 'تمت إضافة الدفعة.')
      setForm({ party_id: selectedId ?? '', amount: '', currency: 'LYD', entry_date: today(), description: '', transaction_id: '' })
      setEditing(null)
      setModalOpen(false)
      await load()
    }
  }

  async function remove() {
    if (!deleting) return
    const { error } = await supabase.from(config.entriesTable).delete().eq('id', deleting.id)
    if (error) setError(error.message)
    else setSuccess('تم حذف القيد.')
    setDeleting(null)
    await load()
  }

  const selectedParty = parties.find((party) => party.id === selectedId)
  const groupedBalances = useMemo(() => {
    return balances.reduce<Record<string, Balance[]>>((acc, row) => {
      const key = String(row[config.partyKey as keyof Balance])
      acc[key] = [...(acc[key] ?? []), row]
      return acc
    }, {})
  }, [balances, config.partyKey])

  const statement = useMemo(() => {
    let running = 0
    return entries.map((entry) => {
      running += entrySign(entry)
      return { ...entry, running_balance: running }
    })
  }, [entries])

  const visibleTransactions = transactions.filter((row) =>
    type === 'customer' ? row.customer_id === form.party_id : row.supplier_id === form.party_id,
  )

  return (
    <section className="page">
      <div className="page-header">
        <h2>{selectedId ? `${config.detailTitle}: ${selectedParty?.name ?? ''}` : config.title}</h2>
        {selectedId && <Link className="button secondary" to={config.listPath}>رجوع</Link>}
      </div>
      {error && <div className="error">{error}</div>}
      {success && <div className="status ok">{success}</div>}

      {canCreateOperationalRecords(profile) && (
        <div className="actions">
          <button onClick={() => { setEditing(null); setForm({ party_id: selectedId ?? '', amount: '', currency: 'LYD', entry_date: today(), description: '', transaction_id: '' }); setModalOpen(true) }}>{config.paymentButton}</button>
        </div>
      )}

      {modalOpen && canCreateOperationalRecords(profile) && (
        <FormModal title={editing ? 'تعديل قيد حساب' : config.paymentButton} onClose={() => { setModalOpen(false); setEditing(null) }}>
        <form className="form-grid" onSubmit={submit}>
          <label>{config.party}<select value={form.party_id} onChange={(event) => setForm({ ...form, party_id: event.target.value, transaction_id: '' })}><option value="">اختر</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select></label>
          <label>المبلغ<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
          <label>العملة<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option>LYD</option><option>USD</option><option>EUR</option></select></label>
          <label>التاريخ<input type="date" value={form.entry_date} onChange={(event) => setForm({ ...form, entry_date: event.target.value })} /></label>
          <label>معاملة مرتبطة اختياريًا<select value={form.transaction_id} onChange={(event) => setForm({ ...form, transaction_id: event.target.value })}><option value="">بدون ربط</option>{visibleTransactions.map((row) => <option key={row.transaction_id} value={row.transaction_id}>{row.transaction_date} / {row.service_name} / {row.currency}</option>)}</select></label>
          <label>الوصف<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="actions">
            <button>{editing ? 'حفظ التعديل' : config.paymentButton}</button>
            <button type="button" className="secondary" onClick={() => { setModalOpen(false); setEditing(null) }}>إلغاء</button>
          </div>
        </form>
        </FormModal>
      )}

      {selectedId && (
        <form className="card form-grid" onSubmit={(event) => event.preventDefault()}>
          <label>من تاريخ<input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
          <label>إلى تاريخ<input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label>
          <label>العملة<select value={filters.currency} onChange={(event) => setFilters({ ...filters, currency: event.target.value })}><option value="">كل العملات</option><option>LYD</option><option>USD</option><option>EUR</option></select></label>
          <div className="actions"><button type="button" className="secondary" onClick={() => setFilters({ dateFrom: '', dateTo: '', currency: '' })}>مسح الفلاتر</button></div>
        </form>
      )}

      {loading ? <div className="loading">جاري التحميل...</div> : selectedId ? (
        <DataTable
          rows={statement}
          columns={[
            { key: 'date', header: 'التاريخ', render: (row) => row.entry_date },
            { key: 'type', header: 'نوع القيد', render: (row) => typeLabel(row.entry_type) },
            { key: 'description', header: 'الوصف', render: (row) => row.description ?? '' },
            { key: 'debit', header: 'مدين', render: (row) => money(entryDebit(row), row.currency) },
            { key: 'credit', header: 'دائن', render: (row) => money(entryCredit(row), row.currency) },
            { key: 'balance', header: 'الرصيد', render: (row) => money(row.running_balance, row.currency) },
            { key: 'currency', header: 'العملة', render: (row) => row.currency },
            { key: 'created_by', header: 'أنشئ بواسطة', render: (row) => row.profiles?.full_name ?? '' },
            { key: 'transaction', header: 'المعاملة', render: (row) => row.transaction_id ? row.transaction_id.slice(0, 8) : '-' },
            { key: 'actions', header: 'الإجراءات', render: (row) => admin ? <div className="actions"><button className="secondary" onClick={() => { setEditing(row); setForm({ party_id: String(row[config.partyKey as keyof Entry] ?? ''), amount: String(row.amount), currency: row.currency, entry_date: row.entry_date, description: row.description ?? '', transaction_id: row.transaction_id ?? '' }); setModalOpen(true) }}>تعديل</button><button className="danger" onClick={() => setDeleting(row)}>حذف</button></div> : 'عرض فقط' },
          ]}
        />
      ) : (
        <DataTable
          rows={parties}
          columns={[
            { key: 'name', header: config.party, render: (row) => row.name },
            {
              key: 'balances',
              header: 'الرصيد حسب العملة',
              render: (row) => groupedBalances[row.id]?.length
                ? groupedBalances[row.id].map((balance) => money(Number(balance.balance), balance.currency)).join(' / ')
                : money(0),
            },
            { key: 'actions', header: 'الإجراءات', render: (row) => <Link className="button secondary" to={`${config.linkBase}/${row.id}`}>كشف الحساب</Link> },
          ]}
        />
      )}
      {deleting && <ConfirmModal title="تأكيد الحذف" message="هل تريد حذف هذا القيد؟" onConfirm={remove} onCancel={() => setDeleting(null)} />}
    </section>
  )
}
