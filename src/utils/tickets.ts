import type { TransactionReportRow, TransactionSummary } from '../types/models'

export type RouteSegment = {
  from?: string
  to?: string
  departure_date?: string
  departure_time?: string
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
        departure_date: typeof segment.departure_date === 'string' ? segment.departure_date : '',
        departure_time: typeof segment.departure_time === 'string' ? segment.departure_time : '',
      }
      if (normalized.from || normalized.to || normalized.departure_date || normalized.departure_time) segments.push(normalized)
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

export function routeSegmentsDetails(value: unknown) {
  return normalizeRouteSegments(value)
    .map((segment) => {
      const route = [segment.from, segment.to].filter(Boolean).join(' → ')
      const dateTime = [segment.departure_date, segment.departure_time].filter(Boolean).join(' ')
      return [route, dateTime].filter(Boolean).join(' - ')
    })
    .filter(Boolean)
}

export function customerDisplayName(row: Pick<TicketLike, 'customer_name' | 'guest_customer_name'>) {
  return row.guest_customer_name || row.customer_name || ''
}

export function customerDisplayPhone(row: Pick<TicketLike, 'customer_phone' | 'guest_customer_phone'>) {
  return row.guest_customer_phone || row.customer_phone || ''
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
  const segmentDetails = routeSegmentsDetails(row.route_segments)
  if (segmentDetails.length) {
    lines.push('مواعيد خط السير:')
    for (const segment of segmentDetails) lines.push(`- ${segment}`)
  } else if (row.departure_date || row.departure_time) {
    lines.push(`موعد الذهاب: ${[row.departure_date, row.departure_time].filter(Boolean).join(' ')}`)
  }
  if (row.return_date || row.return_time) lines.push(`موعد العودة: ${[row.return_date, row.return_time].filter(Boolean).join(' ')}`)

  lines.push('', 'يرجى الاحتفاظ بهذه الرسالة للرجوع إليها لاحقاً.')
  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n')
}

export function whatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/[^\d]/g, '')
  if (!digits) return ''
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
