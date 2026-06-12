import type { ReactNode } from 'react'

type Column<T> = {
  key: string
  header: string
  render: (row: T) => ReactNode
}

export function DataTable<T>({ columns, rows, empty = 'لا توجد بيانات' }: { columns: Column<T>[]; rows: T[]; empty?: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>)
          )}
        </tbody>
      </table>
    </div>
  )
}
