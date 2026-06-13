import type { ReactNode } from 'react'

export type SummaryCard = {
  title: string
  value: ReactNode
}

export function ReportSummaryCards({ cards }: { cards: SummaryCard[] }) {
  if (!cards.length) return null
  return (
    <div className="grid">
      {cards.map((card) => (
        <div className="status" key={card.title}>
          <strong>{card.title}: </strong>
          {card.value}
        </div>
      ))}
    </div>
  )
}
