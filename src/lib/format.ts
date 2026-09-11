export const LUNA_PER_NIM = 100_000

export type Currency = 'NIM' | 'USD'

/** Number part only, e.g. "1,250.5". */
export function nimAmount(luna: number): string {
  const nim = luna / LUNA_PER_NIM
  const digits = nim >= 1000 ? 0 : nim >= 1 ? 2 : 5
  return nim.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function formatNim(luna: number): string {
  return `${nimAmount(luna)} NIM`
}

export function formatUsd(usd: number): string {
  const digits = usd > 0 && usd < 0.01 ? 4 : 2
  return usd.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function lunaToUsd(luna: number, rate: number): number {
  return (luna / LUNA_PER_NIM) * rate
}

/** "Sep 11, 2026 at 19:13" */
export function formatDate(ms: number): string {
  const date = new Date(ms)
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} at ${time}`
}
