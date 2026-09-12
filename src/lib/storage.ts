export type Token = 'nim' | 'usdt'

export interface StoredLink {
  secret: string
  address: string
  /** Luna for NIM, smallest units (6 decimals) for USDT. */
  value: number
  /** Absent on links made before USDT existed, which were all NIM. */
  token?: Token
  createdAt: number
  fundingTx?: string
  /**
   * Terminal state, cached once the funds have left the link. The public RPC has no batch call, so
   * every link costs a request; once a link is settled it can never change again and is never queried.
   */
  settled?: 'claimed' | 'reverted'
  settledAt?: number
}

// The link's private key only lives here (and in the shared link). Losing it before the link is
// claimed means losing the funds, so a failed write must abort the deposit — hence no try/catch.
const KEY = 'kashlink-links'
/** Where links were stored before the rename; still read so older links stay revertable. */
const LEGACY_KEY = 'nimiq-cashlinks'

export function loadLinks(): StoredLink[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  }
  catch {
    return []
  }
}

function write(list: StoredLink[]) {
  const json = JSON.stringify(list)
  localStorage.setItem(KEY, json)
  if (localStorage.getItem(KEY) !== json) throw new Error('Could not save the KashLink on this device.')
}

export function saveLink(link: StoredLink) {
  write([link, ...loadLinks().filter(l => l.address !== link.address)])
}

export function removeLink(address: string) {
  write(loadLinks().filter(l => l.address !== address))
}

// Last known wallet balance, shown instantly on the next visit while a fresh one loads.
const BALANCE_KEY = 'kashlink-balance'

export function loadCachedBalance(): number | null {
  try {
    const value = Number(localStorage.getItem(BALANCE_KEY))
    return Number.isFinite(value) && localStorage.getItem(BALANCE_KEY) !== null ? value : null
  }
  catch {
    return null
  }
}

export function saveCachedBalance(luna: number) {
  try {
    localStorage.setItem(BALANCE_KEY, String(luna))
  }
  catch {
    // only a speed-up; ignore
  }
}
