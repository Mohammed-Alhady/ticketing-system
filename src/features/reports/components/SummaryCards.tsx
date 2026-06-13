import type { ReactNode } from 'react'

export type SummaryCardItem = {
  title: string
  value: ReactNode
  tone?: 'customers' | 'suppliers' | 'transactions' | 'profit' | 'debt' | 'flights'
}

export function SummaryCards({ cards }: { cards: SummaryCardItem[] }) {
  if (!cards.length) return null
  return (
    <div className="summary-grid">
      {cards.map((card) => (
        <section className={`summary-card ${card.tone ?? ''}`} key={card.title}>
          <span>{card.title}</span>
          <strong>{card.value}</strong>
        </section>
      ))}
    </div>
  )
}
