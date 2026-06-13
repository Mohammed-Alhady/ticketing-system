import type { ReactNode } from 'react'

export type ReportItem = {
  id: string
  title: string
  description: string
}

export function ReportCategoryAccordion({
  title,
  description,
  reports,
  open,
  activeReport,
  onToggle,
  onSelect,
}: {
  title: string
  description: string
  reports: ReportItem[]
  open: boolean
  activeReport: string
  onToggle: () => void
  onSelect: (id: string) => void
}) {
  return (
    <section className="card report-category">
      <button type="button" className="report-category-button" onClick={onToggle}>
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <span>{open ? 'إخفاء' : 'عرض'}</span>
      </button>
      {open && (
        <div className="report-list">
          {reports.map((report) => (
            <button
              type="button"
              className={activeReport === report.id ? 'secondary report-item active' : 'secondary report-item'}
              key={report.id}
              onClick={() => onSelect(report.id)}
            >
              <strong>{report.title}</strong>
              <small>{report.description}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export function ReportPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="card report-panel">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </section>
  )
}
