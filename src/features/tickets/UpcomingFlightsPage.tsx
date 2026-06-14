import { useEffect, useMemo, useState } from 'react'
import { DataTable } from '../../components/ui/DataTable'
import { FormModal } from '../../components/ui/FormModal'
import { supabase } from '../../lib/supabase'
import { today } from '../../utils/dates'
import { buildTicketMessage, customerDisplayName, customerDisplayPhone, routeSegmentsDetails, routeSummary, whatsappUrl } from '../../utils/tickets'
import type { TransactionReportRow } from '../../types/models'

type FilterMode = 'all' | 'departures' | 'returns' | 'today' | '7' | '30'

export function UpcomingFlightsPage() {
  const [rows, setRows] = useState<TransactionReportRow[]>([])
  const [filters, setFilters] = useState({ mode: 'all' as FilterMode, search: '', pnr: '', ticket: '' })
  const [messageRow, setMessageRow] = useState<TransactionReportRow | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const currentDate = today()
      const { data, error } = await supabase
        .from('transaction_report_view')
        .select('*')
        .eq('service_type', 'ticket')
        .or(`departure_date.gte.${currentDate},return_date.gte.${currentDate}`)
      if (error) setError(error.message)
      setRows(((data ?? []) as TransactionReportRow[]).sort((a, b) => String(a.departure_date ?? a.return_date ?? '').localeCompare(String(b.departure_date ?? b.return_date ?? ''))))
      setLoading(false)
    }
    load()
  }, [])

  const visibleRows = useMemo(() => {
    const currentDate = today()
    const limitDate = (days: number) => {
      const date = new Date()
      date.setDate(date.getDate() + days)
      return date.toISOString().slice(0, 10)
    }
    const search = filters.search.trim().toLowerCase()
    const pnr = filters.pnr.trim().toLowerCase()
    const ticket = filters.ticket.trim().toLowerCase()

    return rows.filter((row) => {
      const departure = row.departure_date ?? ''
      const returning = row.return_date ?? ''
      if (filters.mode === 'departures' && !(departure >= currentDate)) return false
      if (filters.mode === 'returns' && !(returning >= currentDate)) return false
      if (filters.mode === 'today' && departure !== currentDate && returning !== currentDate) return false
      if (filters.mode === '7') {
        const max = limitDate(7)
        if (!((departure >= currentDate && departure <= max) || (returning >= currentDate && returning <= max))) return false
      }
      if (filters.mode === '30') {
        const max = limitDate(30)
        if (!((departure >= currentDate && departure <= max) || (returning >= currentDate && returning <= max))) return false
      }
      if (search && !customerDisplayName(row).toLowerCase().includes(search)) return false
      if (pnr && !String(row.pnr ?? '').toLowerCase().includes(pnr)) return false
      if (ticket && !String(row.ticket_number ?? '').toLowerCase().includes(ticket)) return false
      return true
    })
  }, [filters, rows])

  async function copyMessage(row: TransactionReportRow) {
    await navigator.clipboard.writeText(buildTicketMessage(row))
    setSuccess('تم نسخ الرسالة.')
    setMessageRow(null)
  }

  return (
    <section className="page">
      <div className="page-header"><h2>الرحلات القادمة</h2></div>
      {error && <div className="error">{error}</div>}
      {success && <div className="status ok">{success}</div>}

      <form className="card form-grid" onSubmit={(event) => event.preventDefault()}>
        <label>النوع<select value={filters.mode} onChange={(event) => setFilters({ ...filters, mode: event.target.value as FilterMode })}><option value="all">كل الرحلات القادمة</option><option value="departures">رحلات الذهاب القادمة</option><option value="returns">رحلات العودة القادمة</option><option value="today">اليوم</option><option value="7">القادمة خلال 7 أيام</option><option value="30">القادمة خلال 30 يوم</option></select></label>
        <label>اسم العميل<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
        <label>PNR<input value={filters.pnr} onChange={(event) => setFilters({ ...filters, pnr: event.target.value })} /></label>
        <label>رقم التذكرة<input value={filters.ticket} onChange={(event) => setFilters({ ...filters, ticket: event.target.value })} /></label>
        <div className="actions"><button type="button" className="secondary" onClick={() => setFilters({ mode: 'all', search: '', pnr: '', ticket: '' })}>مسح الفلاتر</button></div>
      </form>

      {loading ? <div className="loading">جاري التحميل...</div> : (
        <DataTable rows={visibleRows} empty="لا توجد رحلات" columns={[
          { key: 'customer', header: 'العميل', render: (row) => customerDisplayName(row) },
          { key: 'phone', header: 'الهاتف', render: (row) => customerDisplayPhone(row) || '-' },
          { key: 'route', header: 'خط السير', render: (row) => routeSummary(row.route_segments) || '-' },
          { key: 'ticket', header: 'رقم التذكرة', render: (row) => row.ticket_number ?? '-' },
          { key: 'pnr', header: 'PNR', render: (row) => row.pnr ?? '-' },
          { key: 'departure', header: 'الذهاب', render: (row) => routeSegmentsDetails(row.route_segments).join(' / ') || [row.departure_date, row.departure_time].filter(Boolean).join(' ') || '-' },
          { key: 'return', header: 'العودة', render: (row) => [row.return_date, row.return_time].filter(Boolean).join(' ') || '-' },
          { key: 'supplier', header: 'المورد', render: (row) => row.supplier_name },
          { key: 'employee', header: 'الموظف', render: (row) => row.employee_name ?? '' },
          { key: 'message', header: 'الرسالة', render: (row) => <button className="secondary" onClick={() => setMessageRow(row)}>معاينة الرسالة</button> },
        ]} />
      )}
      {messageRow && <TicketMessageModal row={messageRow} onCopy={copyMessage} onClose={() => setMessageRow(null)} />}
    </section>
  )
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
