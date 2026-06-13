import type { ReactNode } from 'react'

export function DashboardCard({
  title,
  value,
  hint,
  variant,
}: {
  title: string
  value: ReactNode
  hint?: string
  variant?: 'customers' | 'suppliers' | 'transactions' | 'profit' | 'debt' | 'flights'
}) {
  return (
    <section className={`card dashboard-card ${variant ?? ''}`}>
      <h3>{title}</h3>
      <div className="metric">{value}</div>
      {hint && <p>{hint}</p>}
    </section>
  )
}
