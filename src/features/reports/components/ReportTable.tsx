import { DataTable } from '../../../components/ui/DataTable'
import type { ReactNode } from 'react'

export type ReportColumn<T> = {
  key: string
  header: string
  render: (row: T) => ReactNode
}

export function ReportTable<T>({ rows, columns, empty = 'لا توجد نتائج' }: { rows: T[]; columns: ReportColumn<T>[]; empty?: string }) {
  return (
    <section className="card report-table-card">
      <DataTable rows={rows} columns={columns} empty={empty} />
    </section>
  )
}
