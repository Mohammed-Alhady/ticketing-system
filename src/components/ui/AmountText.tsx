import { money } from '../../utils/money'

export function amountTone(value: number) {
  if (value > 0) return 'amount-positive'
  if (value < 0) return 'amount-negative'
  return 'amount-zero'
}

export function AmountText({ value, currency }: { value: number; currency?: string }) {
  return <span className={amountTone(Number(value || 0))}>{money(value, currency)}</span>
}

export function formatAmountWithColor(value: number, currency?: string) {
  return <AmountText value={value} currency={currency} />
}
