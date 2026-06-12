import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { canMutateRecords, canCreateOperationalRecords } from '../../lib/permissions'
import { money } from '../../utils/money'
import { today } from '../../utils/dates'
import type { Customer, Profile, Service, Supplier, TransactionSummary } from '../../types/models'
import { DataTable } from '../../components/ui/DataTable'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { FormModal } from '../../components/ui/FormModal'
import { useAuth } from '../auth/AuthContext'

type FormState = {
  customer_id: string
  supplier_id: string
  service_id: string
  transaction_date: string
  issue_date: string
  supplier_cost: string
  customer_price: string
  currency: string
  notes: string
  employee_id: string
}

const initialForm: FormState = {
  customer_id: '',
  supplier_id: '',
  service_id: '',
  transaction_date: today(),
  issue_date: '',
  supplier_cost: '',
  customer_price: '',
  currency: 'LYD',
  notes: '',
  employee_id: '',
}

export function TransactionsPage() {
  const { profile } = useAuth()
  const admin = canMutateRecords(profile)
  const canCreate = canCreateOperationalRecords(profile)
  const [rows, setRows] = useState<TransactionSummary[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [form, setForm] = useState(initialForm)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    setLoading(true)
    const [summary, customerData, supplierData, serviceData, employeeData] = await Promise.all([
      supabase.from('transaction_summary').select('*').order('transaction_date', { ascending: false }),
      supabase.from('customers').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('services').select('*').eq('is_active', true).order('name'),
      supabase.from('profiles').select('*').order('full_name'),
    ])
    const firstError = summary.error ?? customerData.error ?? supplierData.error ?? serviceData.error ?? employeeData.error
    if (firstError) setError(firstError.message)
    setRows((summary.data ?? []) as TransactionSummary[])
    setCustomers((customerData.data ?? []) as Customer[])
    setSuppliers((supplierData.data ?? []) as Supplier[])
    setServices((serviceData.data ?? []) as Service[])
    setEmployees((employeeData.data ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function reset() {
    setForm(initialForm)
    setEditing(null)
    setModalOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!form.customer_id || !form.supplier_id || !form.service_id || !form.supplier_cost || !form.customer_price) {
      setError('العميل والمورد والخدمة والتكلفة والسعر مطلوبة.')
      return
    }
    const payload = {
      ...form,
      issue_date: form.issue_date || null,
      supplier_cost: Number(form.supplier_cost),
      customer_price: Number(form.customer_price),
      created_by: profile?.id,
      employee_id: admin ? form.employee_id || profile?.id : profile?.id,
    }
    const result = editing
      ? await supabase.from('transactions').update(payload).eq('id', editing)
      : await supabase.from('transactions').insert(payload)
    if (result.error) setError(result.error.message)
    else {
      setSuccess(editing ? 'تم حفظ التعديل.' : 'تمت إضافة المعاملة.')
      reset()
      await load()
    }
  }

  async function remove() {
    if (!deleting) return
    const { error } = await supabase.from('transactions').delete().eq('id', deleting)
    if (error) setError(error.message)
    setDeleting(null)
    await load()
  }

  const profit = Number(form.customer_price || 0) - Number(form.supplier_cost || 0)

  return (
    <section className="page">
      <div className="page-header">
        <h2>المعاملات</h2>
        <div className="actions">
          {!admin && <span className="status">الموظف يمكنه الإضافة والعرض فقط</span>}
          {canCreate && <button onClick={() => { setForm({ ...initialForm, employee_id: profile?.id ?? '' }); setEditing(null); setModalOpen(true) }}>إضافة معاملة</button>}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {success && <div className="status ok">{success}</div>}
      {modalOpen && canCreate && (
        <FormModal title={editing ? 'تعديل معاملة' : 'إضافة معاملة'} onClose={reset}>
        <form className="form-grid" onSubmit={submit}>
          <label>العميل<select value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value })}><option value="">اختر</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>المورد<select value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })}><option value="">اختر</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>الخدمة<select value={form.service_id} onChange={(event) => setForm({ ...form, service_id: event.target.value })}><option value="">اختر</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>تاريخ المعاملة<input type="date" value={form.transaction_date} onChange={(event) => setForm({ ...form, transaction_date: event.target.value })} /></label>
          <label>تاريخ الإصدار<input type="date" value={form.issue_date} onChange={(event) => setForm({ ...form, issue_date: event.target.value })} /></label>
          <label>تكلفة المورد<input type="number" min="0" step="0.01" value={form.supplier_cost} onChange={(event) => setForm({ ...form, supplier_cost: event.target.value })} /></label>
          <label>سعر العميل<input type="number" min="0" step="0.01" value={form.customer_price} onChange={(event) => setForm({ ...form, customer_price: event.target.value })} /></label>
          <label>العملة<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option>LYD</option><option>USD</option><option>EUR</option></select></label>
          {admin && <label>الموظف<select value={form.employee_id || (profile?.id ?? '')} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}><option value="">اختر</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>}
          <label>ملاحظات<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <div className="card"><strong>الربح المتوقع</strong><div className="metric">{money(profit, form.currency)}</div></div>
          <div className="actions">
            <button disabled={Boolean(editing) && !admin}>{editing ? 'حفظ التعديل' : 'إضافة معاملة'}</button>
            <button type="button" className="secondary" onClick={reset}>إلغاء</button>
          </div>
        </form>
        </FormModal>
      )}
      {loading ? <div className="loading">جاري التحميل...</div> : (
        <DataTable
          rows={rows}
          columns={[
            { key: 'date', header: 'التاريخ', render: (row) => row.transaction_date },
            { key: 'customer', header: 'العميل', render: (row) => row.customer_name },
            { key: 'supplier', header: 'المورد', render: (row) => row.supplier_name },
            { key: 'service', header: 'الخدمة', render: (row) => row.service_name },
            { key: 'customer_price', header: 'سعر العميل', render: (row) => money(row.customer_price, row.currency) },
            { key: 'supplier_cost', header: 'تكلفة المورد', render: (row) => money(row.supplier_cost, row.currency) },
            { key: 'profit', header: 'الربح', render: (row) => money(row.expected_profit, row.currency) },
            { key: 'employee', header: 'الموظف', render: (row) => row.employee_name ?? '' },
            { key: 'customer_remaining', header: 'باقي العميل', render: (row) => money(row.customer_remaining, row.currency) },
            { key: 'supplier_remaining', header: 'باقي المورد', render: (row) => money(row.supplier_remaining, row.currency) },
            { key: 'actions', header: 'الإجراءات', render: (row) => admin ? <div className="actions"><button className="secondary" onClick={() => { setEditing(row.transaction_id); setForm({ customer_id: row.customer_id, supplier_id: row.supplier_id, service_id: row.service_id, transaction_date: row.transaction_date, issue_date: row.issue_date ?? '', supplier_cost: String(row.supplier_cost), customer_price: String(row.customer_price), currency: row.currency, notes: '', employee_id: row.employee_id ?? profile?.id ?? '' }); setModalOpen(true) }}>تعديل</button><button className="danger" onClick={() => setDeleting(row.transaction_id)}>حذف</button></div> : 'عرض فقط' },
          ]}
        />
      )}
      {deleting && <ConfirmModal title="تأكيد الحذف" message="هل تريد حذف المعاملة؟" onConfirm={remove} onCancel={() => setDeleting(null)} />}
    </section>
  )
}
