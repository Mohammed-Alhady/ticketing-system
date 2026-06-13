import type { FormEvent, ReactNode } from 'react'

export function ReportFilters({ children, onSearch, onReset }: { children: ReactNode; onSearch: (event: FormEvent) => void; onReset: () => void }) {
  return (
    <section className="card report-filter-card">
      <form className="form-grid" onSubmit={onSearch}>
        {children}
        <div className="actions">
          <button>بحث</button>
          <button type="button" className="secondary" onClick={onReset}>مسح الفلاتر</button>
          <button type="button" className="warning">تصدير قريبا</button>
        </div>
      </form>
    </section>
  )
}
