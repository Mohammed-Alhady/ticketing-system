import { DataTable } from '../../components/ui/DataTable'
import type { ReactNode } from 'react'

type Column<T> = {
  key: string
  header: string
  render: (row: T) => ReactNode
}

export function ReportResultsTable<T>({ rows, columns, empty = 'لا توجد نتائج' }: { rows: T[]; columns: Column<T>[]; empty?: string }) {
  return <DataTable rows={rows} columns={columns} empty={empty} />
}
