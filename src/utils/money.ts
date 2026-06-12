import type { Currency } from '../types/models'

export function money(value = 0, currency: Currency | string = 'LYD') {
  return `${Number(value || 0).toLocaleString('ar-LY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}
