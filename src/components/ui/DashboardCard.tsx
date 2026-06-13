import type { ReactNode } from 'react'

export function DashboardCard({ title, value, hint }: { title: string; value: ReactNode; hint?: string }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <div className="metric">{value}</div>
      {hint && <p>{hint}</p>}
    </section>
  )
}
