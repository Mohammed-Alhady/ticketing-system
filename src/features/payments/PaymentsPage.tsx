import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { canCreateOperationalRecords } from '../../lib/permissions'
import { today } from '../../utils/dates'
import { money } from '../../utils/money'
import type { TransactionSummary } from '../../types/models'
import { DataTable } from '../../components/ui/DataTable'
import { useAuth } from '../auth/AuthContext'

export function PaymentsPage({ type }: { type: 'customer' | 'supplier' }) {
  const { profile } = useAuth()
  const [transactions, setTransactions] = useState<TransactionSummary[]>([])
  const [payments, setPayments] = useState<Record<string, unknown>[]>([])
  const [form, setForm] = useState({ transaction_id: '', amount: '', currency: 'LYD', payment_date: today(), payment_method: 'cash', notes: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const table = type === 'customer' ? 'customer_payments' : 'supplier_payments'
  const personKey = type === 'customer' ? 'customer_id' : 'supplier_id'
  const title = type === 'customer' ? 'دفعات العملاء' : 'دفعات الموردين'

  const load = useCallback(async () => {
    setLoading(true)
    const [summary, paymentRows] = await Promise.all([
      supabase.from('transaction_summary').select('*').order('transaction_date', { ascending: false }),
      supabase.from(table).select('*').order('payment_date', { ascending: false }),
    ])
    const firstError = summary.error ?? paymentRows.error
    if (firstError) setError(firstError.message)
    setTransactions((summary.data ?? []) as TransactionSummary[])
    setPayments((paymentRows.data ?? []) as Record<string, unknown>[])
    setLoading(false)
  }, [table])

  useEffect(() => {
    load()
  }, [load])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const selected = transactions.find((row) => row.transaction_id === form.transaction_id)
    if (!selected || !form.amount) {
      setError('المعاملة والمبلغ مطلوبان.')
      return
    }
    const payload = {
      transaction_id: selected.transaction_id,
      [personKey]: type === 'customer' ? selected.customer_id : selected.supplier_id,
      amount: Number(form.amount),
      currency: form.currency,
      payment_date: form.payment_date,
      payment_method: form.payment_method,
      notes: form.notes,
      created_by: profile?.id,
    }
    const { error } = await supabase.from(table).insert(payload)
    if (error) setError(error.message)
    else {
      setForm({ transaction_id: '', amount: '', currency: 'LYD', payment_date: today(), payment_method: 'cash', notes: '' })
      await load()
    }
  }

  return (
    <section className="page">
      <div className="page-header"><h2>{title}</h2></div>
      {error && <div className="error">{error}</div>}
      {canCreateOperationalRecords(profile) && (
        <form className="card form-grid" onSubmit={submit}>
          <label>المعاملة<select value={form.transaction_id} onChange={(event) => setForm({ ...form, transaction_id: event.target.value })}><option value="">اختر</option>{transactions.map((row) => <option key={row.transaction_id} value={row.transaction_id}>{row.customer_name} / {row.supplier_name} / {row.service_name} / {row.currency}</option>)}</select></label>
          <label>المبلغ<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
          <label>العملة<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option>LYD</option><option>USD</option><option>EUR</option></select></label>
          <label>تاريخ الدفع<input type="date" value={form.payment_date} onChange={(event) => setForm({ ...form, payment_date: event.target.value })} /></label>
          <label>طريقة الدفع<select value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value })}><option value="cash">نقدا</option><option value="bank_transfer">تحويل</option><option value="card">بطاقة</option><option value="other">أخرى</option></select></label>
          <label>ملاحظات<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <button>إضافة دفعة</button>
        </form>
      )}
      {loading ? <div className="loading">جاري التحميل...</div> : (
        <DataTable
          rows={payments}
          columns={[
            { key: 'date', header: 'التاريخ', render: (row) => String(row.payment_date ?? '') },
            { key: 'amount', header: 'المبلغ', render: (row) => money(Number(row.amount), String(row.currency)) },
            { key: 'method', header: 'الطريقة', render: (row) => String(row.payment_method ?? '') },
            { key: 'notes', header: 'ملاحظات', render: (row) => String(row.notes ?? '') },
          ]}
        />
      )}
    </section>
  )
}
