import type { TransactionReportRow, TransactionSummary } from '../types/models'

export type RouteSegment = {
  from?: string
  to?: string
}

export type TicketLike = Pick<
  TransactionReportRow | TransactionSummary,
  | 'customer_name'
  | 'guest_customer_name'
  | 'customer_phone'
  | 'guest_customer_phone'
  | 'route_segments'
  | 'ticket_number'
  | 'pnr'
  | 'departure_date'
  | 'departure_time'
  | 'return_date'
  | 'return_time'
>

export function normalizeRouteSegments(value: unknown): RouteSegment[] {
  if (!Array.isArray(value)) return []
  const segments: RouteSegment[] = []
  for (const item of value) {
    if (item && typeof item === 'object') {
      const segment = item as Record<string, unknown>
      const normalized = {
        from: typeof segment.from === 'string' ? segment.from : '',
        to: typeof segment.to === 'string' ? segment.to : '',
      }
      if (normalized.from || normalized.to) segments.push(normalized)
    }
  }
  return segments
}

export function routeSummary(value: unknown) {
  const segments = normalizeRouteSegments(value)
  if (!segments.length) return ''
  const stops: string[] = []
  for (const segment of segments) {
    if (segment.from && stops.at(-1) !== segment.from) stops.push(segment.from)
    if (segment.to) stops.push(segment.to)
  }
  return stops.join(' → ')
}

export function customerDisplayName(row: Pick<TicketLike, 'customer_name' | 'guest_customer_name'>) {
  return row.customer_name || row.guest_customer_name || ''
}

export function customerDisplayPhone(row: Pick<TicketLike, 'customer_phone' | 'guest_customer_phone'>) {
  return row.customer_phone || row.guest_customer_phone || ''
}

export function buildTicketMessage(row: TicketLike) {
  const lines = [
    `مرحباً ${customerDisplayName(row) || 'عميلنا'},`,
    'تم إصدار تذكرتك بنجاح.',
    '',
  ]

  if (row.ticket_number) lines.push(`رقم التذكرة: ${row.ticket_number}`)
  if (row.pnr) lines.push(`PNR: ${row.pnr}`)
  const route = routeSummary(row.route_segments)
  if (route) lines.push(`الوجهة: ${route}`)
  if (row.departure_date || row.departure_time) lines.push(`موعد الذهاب: ${[row.departure_date, row.departure_time].filter(Boolean).join(' ')}`)
  if (row.return_date || row.return_time) lines.push(`موعد العودة: ${[row.return_date, row.return_time].filter(Boolean).join(' ')}`)

  lines.push('', 'يرجى الاحتفاظ بهذه الرسالة للرجوع إليها لاحقاً.')
  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n')
}

export function whatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/[^\d]/g, '')
  if (!digits) return ''
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
