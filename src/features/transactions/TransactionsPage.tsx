import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { canCreateOperationalRecords, canMutateRecords } from '../../lib/permissions'
import { today } from '../../utils/dates'
import { buildTicketMessage, customerDisplayName, customerDisplayPhone, normalizeRouteSegments, routeSegmentsDetails, routeSummary, whatsappUrl, type RouteSegment } from '../../utils/tickets'
import type { Customer, Profile, Service, Supplier, TransactionSummary } from '../../types/models'
import { DataTable } from '../../components/ui/DataTable'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { FormModal } from '../../components/ui/FormModal'
import { AmountText } from '../../components/ui/AmountText'
import { useAuth } from '../auth/AuthContext'

type FormState = {
  customer_type: 'saved' | 'guest'
  customer_id: string
  guest_customer_name: string
  guest_customer_phone: string
  guest_customer_notes: string
  supplier_id: string
  service_id: string
  transaction_date: string
  issue_date: string
  supplier_cost: string
  customer_price: string
  currency: string
  notes: string
  ticket_number: string
  pnr: string
  route_segments: RouteSegment[]
  departure_date: string
  departure_time: string
  return_date: string
  return_time: string
  employee_id: string
}

const initialForm: FormState = {
  customer_type: 'saved',
  customer_id: '',
  guest_customer_name: '',
  guest_customer_phone: '',
  guest_customer_notes: '',
  supplier_id: '',
  service_id: '',
  transaction_date: today(),
  issue_date: '',
  supplier_cost: '',
  customer_price: '',
  currency: 'LYD',
  notes: '',
  ticket_number: '',
  pnr: '',
  route_segments: [{ from: '', to: '' }],
  departure_date: '',
  departure_time: '',
  return_date: '',
  return_time: '',
  employee_id: '',
}

const oneTimeCustomerName = 'عملاء لمرة واحدة'

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
  const [messageRow, setMessageRow] = useState<TransactionSummary | null>(null)
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

  const selectedService = useMemo(() => services.find((service) => service.id === form.service_id), [form.service_id, services])
  const oneTimeCustomer = useMemo(() => customers.find((customer) => customer.name === oneTimeCustomerName), [customers])
  const isTicket = selectedService?.type === 'ticket'
  const profit = Number(form.customer_price || 0) - Number(form.supplier_cost || 0)

  function updateSegment(index: number, key: keyof RouteSegment, value: string) {
    setForm((current) => ({
      ...current,
      route_segments: current.route_segments.map((segment, segmentIndex) => segmentIndex === index ? { ...segment, [key]: value } : segment),
    }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (form.customer_type === 'saved' && !form.customer_id) {
      setError('اختر العميل المحفوظ أولا.')
      return
    }
    if (form.customer_type === 'guest' && !form.guest_customer_name.trim()) {
      setError('اسم العميل المؤقت مطلوب.')
      return
    }
    if (form.customer_type === 'guest' && !oneTimeCustomer) {
      setError(`حساب ${oneTimeCustomerName} غير موجود. شغل ترحيل قاعدة البيانات الجديد أولا.`)
      return
    }
    if (!form.supplier_id || !form.service_id || !form.supplier_cost || !form.customer_price) {
      setError('المورد والخدمة والتكلفة والسعر مطلوبة.')
      return
    }

    const routeSegments = form.route_segments
      .map((segment) => ({
        from: segment.from?.trim() ?? '',
        to: segment.to?.trim() ?? '',
        departure_date: segment.departure_date || '',
        departure_time: segment.departure_time || '',
      }))
      .filter((segment) => segment.from || segment.to || segment.departure_date || segment.departure_time)
    const firstSegment = routeSegments[0]

    const payload = {
      customer_id: form.customer_type === 'saved' ? form.customer_id : oneTimeCustomer?.id,
      guest_customer_name: form.customer_type === 'guest' ? form.guest_customer_name.trim() : null,
      guest_customer_phone: form.customer_type === 'guest' ? form.guest_customer_phone.trim() || null : null,
      guest_customer_notes: form.customer_type === 'guest' ? form.guest_customer_notes.trim() || null : null,
      supplier_id: form.supplier_id,
      service_id: form.service_id,
      transaction_date: form.transaction_date,
      issue_date: form.issue_date || null,
      supplier_cost: Number(form.supplier_cost),
      customer_price: Number(form.customer_price),
      currency: form.currency,
      notes: form.notes,
      ticket_number: isTicket ? form.ticket_number.trim() || null : null,
      pnr: isTicket ? form.pnr.trim() || null : null,
      route_segments: isTicket && routeSegments.length ? routeSegments : null,
      departure_date: isTicket ? firstSegment?.departure_date || form.departure_date || null : null,
      departure_time: isTicket ? firstSegment?.departure_time || form.departure_time || null : null,
      return_date: isTicket ? form.return_date || null : null,
      return_time: isTicket ? form.return_time || null : null,
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

  async function copyMessage(row: TransactionSummary) {
    await navigator.clipboard.writeText(buildTicketMessage(row))
    setSuccess('تم نسخ الرسالة.')
    setMessageRow(null)
  }

  function openForEdit(row: TransactionSummary) {
    const routeSegments = normalizeRouteSegments(row.route_segments)
    if (routeSegments.length && !routeSegments[0].departure_date && row.departure_date) routeSegments[0].departure_date = row.departure_date
    if (routeSegments.length && !routeSegments[0].departure_time && row.departure_time) routeSegments[0].departure_time = row.departure_time
    setEditing(row.transaction_id)
    setForm({
      customer_type: row.customer_type === 'guest' || Boolean(row.guest_customer_name) ? 'guest' : 'saved',
      customer_id: row.customer_id ?? '',
      guest_customer_name: row.guest_customer_name ?? '',
      guest_customer_phone: row.guest_customer_phone ?? '',
      guest_customer_notes: row.guest_customer_notes ?? '',
      supplier_id: row.supplier_id,
      service_id: row.service_id,
      transaction_date: row.transaction_date,
      issue_date: row.issue_date ?? '',
      supplier_cost: String(row.supplier_cost),
      customer_price: String(row.customer_price),
      currency: row.currency,
      notes: '',
      ticket_number: row.ticket_number ?? '',
      pnr: row.pnr ?? '',
      route_segments: routeSegments.length ? routeSegments : [{ from: '', to: '', departure_date: row.departure_date ?? '', departure_time: row.departure_time ?? '' }],
      departure_date: row.departure_date ?? '',
      departure_time: row.departure_time ?? '',
      return_date: row.return_date ?? '',
      return_time: row.return_time ?? '',
      employee_id: row.employee_id ?? profile?.id ?? '',
    })
    setModalOpen(true)
  }

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
          <label>نوع العميل<select value={form.customer_type} onChange={(event) => setForm({ ...form, customer_type: event.target.value as 'saved' | 'guest', customer_id: '', guest_customer_name: '', guest_customer_phone: '', guest_customer_notes: '' })}><option value="saved">عميل محفوظ</option><option value="guest">عميل مؤقت / مرة واحدة</option></select></label>
          {form.customer_type === 'saved' ? (
            <label>العميل<select value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value })}><option value="">اختر</option>{customers.filter((item) => item.name !== oneTimeCustomerName).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          ) : (
            <>
              <label>اسم العميل المؤقت<input value={form.guest_customer_name} onChange={(event) => setForm({ ...form, guest_customer_name: event.target.value })} /></label>
              <label>هاتف العميل المؤقت<input value={form.guest_customer_phone} onChange={(event) => setForm({ ...form, guest_customer_phone: event.target.value })} /></label>
              <label>ملاحظات العميل المؤقت<textarea value={form.guest_customer_notes} onChange={(event) => setForm({ ...form, guest_customer_notes: event.target.value })} /></label>
            </>
          )}
          <label>المورد<select value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })}><option value="">اختر</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>الخدمة<select value={form.service_id} onChange={(event) => setForm({ ...form, service_id: event.target.value })}><option value="">اختر</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>تاريخ المعاملة<input type="date" value={form.transaction_date} onChange={(event) => setForm({ ...form, transaction_date: event.target.value })} /></label>
          <label>تاريخ الإصدار<input type="date" value={form.issue_date} onChange={(event) => setForm({ ...form, issue_date: event.target.value })} /></label>
          <label>تكلفة المورد<input type="number" min="0" step="0.01" value={form.supplier_cost} onChange={(event) => setForm({ ...form, supplier_cost: event.target.value })} /></label>
          <label>سعر العميل<input type="number" min="0" step="0.01" value={form.customer_price} onChange={(event) => setForm({ ...form, customer_price: event.target.value })} /></label>
          <label>العملة<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option>LYD</option><option>USD</option><option>EUR</option></select></label>
          {admin && <label>الموظف<select value={form.employee_id || (profile?.id ?? '')} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}><option value="">اختر</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>}
          {isTicket && (
            <>
              <label>رقم التذكرة<input value={form.ticket_number} onChange={(event) => setForm({ ...form, ticket_number: event.target.value })} /></label>
              <label>PNR<input value={form.pnr} onChange={(event) => setForm({ ...form, pnr: event.target.value })} /></label>
              <label>تاريخ العودة<input type="date" value={form.return_date} onChange={(event) => setForm({ ...form, return_date: event.target.value })} /></label>
              <label>وقت العودة<input type="time" value={form.return_time} onChange={(event) => setForm({ ...form, return_time: event.target.value })} /></label>
              <div className="card">
                <h3>خط السير</h3>
                {form.route_segments.map((segment, index) => (
                  <div className="form-grid" key={index}>
                    <label>من<input value={segment.from ?? ''} onChange={(event) => updateSegment(index, 'from', event.target.value)} /></label>
                    <label>إلى<input value={segment.to ?? ''} onChange={(event) => updateSegment(index, 'to', event.target.value)} /></label>
                    <label>تاريخ المغادرة<input type="date" value={segment.departure_date ?? ''} onChange={(event) => updateSegment(index, 'departure_date', event.target.value)} /></label>
                    <label>وقت المغادرة<input type="time" value={segment.departure_time ?? ''} onChange={(event) => updateSegment(index, 'departure_time', event.target.value)} /></label>
                    <div className="actions"><button type="button" className="danger" onClick={() => {
                      const next = form.route_segments.filter((_, segmentIndex) => segmentIndex !== index)
                      setForm({ ...form, route_segments: next.length ? next : [{ from: '', to: '', departure_date: '', departure_time: '' }] })
                    }}>حذف المقطع</button></div>
                  </div>
                ))}
                <div className="actions"><button type="button" className="secondary" onClick={() => setForm({ ...form, route_segments: [...form.route_segments, { from: '', to: '', departure_date: '', departure_time: '' }] })}>إضافة مقطع</button></div>
              </div>
            </>
          )}
          <label>ملاحظات<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <div className="card"><strong>الربح المتوقع</strong><div className="metric"><AmountText value={profit} currency={form.currency} /></div></div>
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
            { key: 'customer', header: 'العميل', render: (row) => customerDisplayName(row) },
            { key: 'supplier', header: 'المورد', render: (row) => row.supplier_name },
            { key: 'service', header: 'الخدمة', render: (row) => row.service_name },
            { key: 'ticket_number', header: 'رقم التذكرة', render: (row) => row.ticket_number ?? '-' },
            { key: 'pnr', header: 'PNR', render: (row) => row.pnr ?? '-' },
            { key: 'route', header: 'خط السير', render: (row) => routeSummary(row.route_segments) || '-' },
            { key: 'departure', header: 'الذهاب', render: (row) => routeSegmentsDetails(row.route_segments).join(' / ') || [row.departure_date, row.departure_time].filter(Boolean).join(' ') || '-' },
            { key: 'return', header: 'العودة', render: (row) => [row.return_date, row.return_time].filter(Boolean).join(' ') || '-' },
            { key: 'customer_price', header: 'سعر العميل', render: (row) => <AmountText value={Number(row.customer_price)} currency={row.currency} /> },
            { key: 'supplier_cost', header: 'تكلفة المورد', render: (row) => <AmountText value={Number(row.supplier_cost)} currency={row.currency} /> },
            { key: 'profit', header: 'الربح', render: (row) => <AmountText value={Number(row.expected_profit)} currency={row.currency} /> },
            { key: 'employee', header: 'الموظف', render: (row) => row.employee_name ?? '' },
            { key: 'customer_remaining', header: 'باقي العميل', render: (row) => <AmountText value={Number(row.customer_remaining)} currency={row.currency} /> },
            { key: 'supplier_remaining', header: 'باقي المورد', render: (row) => <AmountText value={Number(row.supplier_remaining)} currency={row.currency} /> },
            { key: 'message', header: 'الرسالة', render: (row) => row.ticket_number || row.pnr || routeSummary(row.route_segments) ? <button className="secondary" onClick={() => setMessageRow(row)}>إرسال رسالة</button> : '-' },
            { key: 'actions', header: 'الإجراءات', render: (row) => admin ? <div className="actions"><button className="secondary" onClick={() => openForEdit(row)}>تعديل</button><button className="danger" onClick={() => setDeleting(row.transaction_id)}>حذف</button></div> : 'عرض فقط' },
          ]}
        />
      )}
      {messageRow && <TicketMessageModal row={messageRow} onCopy={copyMessage} onClose={() => setMessageRow(null)} />}
      {deleting && <ConfirmModal title="تأكيد الحذف" message="هل تريد حذف المعاملة؟" onConfirm={remove} onCancel={() => setDeleting(null)} />}
    </section>
  )
}

function TicketMessageModal({ row, onCopy, onClose }: { row: TransactionSummary; onCopy: (row: TransactionSummary) => void; onClose: () => void }) {
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
