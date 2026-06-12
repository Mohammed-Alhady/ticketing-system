import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { canCreateOperationalRecords, canMutateRecords } from '../../lib/permissions'
import { useAuth } from '../auth/AuthContext'
import { DataTable } from '../../components/ui/DataTable'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { FormModal } from '../../components/ui/FormModal'

export type Field = {
  name: string
  label: string
  required?: boolean
  type?: 'text' | 'email' | 'textarea' | 'select' | 'checkbox'
  options?: { value: string; label: string }[]
}

type Row = Record<string, string | boolean | null>
type Payload = Record<string, unknown>

const emptyRow = (fields: Field[]) =>
  fields.reduce<Row>((acc, field) => {
    acc[field.name] = field.type === 'checkbox' ? true : ''
    return acc
  }, {})

export function CrudPage({
  title,
  table,
  fields,
  columns,
  allowEmployeeCreate = false,
  addLabel = 'إضافة',
}: {
  title: string
  table: string
  fields: Field[]
  columns: { key: string; header: string }[]
  allowEmployeeCreate?: boolean
  addLabel?: string
}) {
  const { profile } = useAuth()
  const admin = canMutateRecords(profile)
  const canCreate = admin || (allowEmployeeCreate && canCreateOperationalRecords(profile))
  const [rows, setRows] = useState<Row[]>([])
  const [form, setForm] = useState<Row>(() => emptyRow(fields))
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const loadRows = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setRows((data ?? []) as Row[])
    setLoading(false)
  }, [table])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  function reset() {
    setForm(emptyRow(fields))
    setEditing(null)
    setModalOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    for (const field of fields) {
      if (field.required && !form[field.name]) {
        setError(`${field.label} مطلوب.`)
        return
      }
    }
    const payload: Payload = { ...form }
    if (table !== 'profiles' && profile?.id) payload.created_by = profile.id
    const result = editing
      ? await supabase.from(table).update(payload).eq('id', editing)
      : await supabase.from(table).insert(payload)
    if (result.error) setError(result.error.message)
    else {
      setSuccess(editing ? 'تم حفظ التعديل.' : 'تمت الإضافة بنجاح.')
      reset()
      await loadRows()
    }
  }

  async function remove() {
    if (!deleting) return
    const { error } = await supabase.from(table).delete().eq('id', deleting.id)
    if (error) setError(error.message)
    setDeleting(null)
    await loadRows()
  }

  return (
    <section className="page">
      <div className="page-header">
        <h2>{title}</h2>
        <div className="actions">
          {!admin && <span className="status">عرض فقط للموظف</span>}
          {canCreate && <button onClick={() => { setForm(emptyRow(fields)); setEditing(null); setModalOpen(true) }}>{addLabel}</button>}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {success && <div className="status ok">{success}</div>}
      {loading ? (
        <div className="loading">جاري تحميل البيانات...</div>
      ) : (
        <DataTable
          rows={rows}
          columns={[
            ...columns.map((column) => ({
              key: column.key,
              header: column.header,
              render: (row: Row) => String(row[column.key] ?? ''),
            })),
            {
              key: 'actions',
              header: 'الإجراءات',
              render: (row: Row) =>
                admin ? (
                  <div className="actions">
                    <button className="secondary" onClick={() => { setEditing(String(row.id)); setForm({ ...emptyRow(fields), ...row }); setModalOpen(true) }}>تعديل</button>
                    <button className="danger" onClick={() => setDeleting(row)}>حذف</button>
                  </div>
                ) : (
                  'غير متاح'
                ),
            },
          ]}
        />
      )}
      {modalOpen && canCreate && (
        <FormModal title={editing ? `تعديل ${title}` : addLabel} onClose={reset}>
          <form className="form-grid" onSubmit={submit}>
            {fields.map((field) => (
              <label key={field.name}>
                {field.label}
                {field.type === 'textarea' ? (
                  <textarea value={String(form[field.name] ?? '')} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })} />
                ) : field.type === 'select' ? (
                  <select value={String(form[field.name] ?? '')} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}>
                    <option value="">اختر</option>
                    {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : field.type === 'checkbox' ? (
                  <input type="checkbox" checked={Boolean(form[field.name])} onChange={(event) => setForm({ ...form, [field.name]: event.target.checked })} />
                ) : (
                  <input type={field.type ?? 'text'} value={String(form[field.name] ?? '')} onChange={(event) => setForm({ ...form, [field.name]: event.target.value })} />
                )}
              </label>
            ))}
            <div className="actions">
              <button disabled={Boolean(editing) && !admin}>{editing ? 'حفظ التعديل' : 'حفظ'}</button>
              <button type="button" className="secondary" onClick={reset}>إلغاء</button>
            </div>
          </form>
        </FormModal>
      )}
      {deleting && <ConfirmModal title="تأكيد الحذف" message="هل تريد حذف هذا السجل؟" onConfirm={remove} onCancel={() => setDeleting(null)} />}
    </section>
  )
}
