import type { FormEvent, ReactNode } from 'react'

export function ReportFilterForm({
  children,
  onSubmit,
  onReset,
}: {
  children: ReactNode
  onSubmit: (event: FormEvent) => void
  onReset: () => void
}) {
  return (
    <form className="form-grid" onSubmit={onSubmit}>
      {children}
      <div className="actions">
        <button>بحث</button>
        <button type="button" className="secondary" onClick={onReset}>مسح الفلاتر</button>
      </div>
    </form>
  )
}
