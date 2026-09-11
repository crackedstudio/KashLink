export interface StoredLink {
  secret: string
  address: string
  /** Luna. */
  value: number
  createdAt: number
  fundingTx?: string
}

// The link's private key only lives here (and in the shared link). Losing it before the link is
// claimed means losing the funds, so a failed write must abort the deposit — hence no try/catch.
const KEY = 'nimiq-cashlinks'

export function loadLinks(): StoredLink[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list : []
  }
  catch {
    return []
  }
}

function write(list: StoredLink[]) {
  const json = JSON.stringify(list)
  localStorage.setItem(KEY, json)
  if (localStorage.getItem(KEY) !== json) throw new Error('Could not save the Cash Link on this device.')
}

export function saveLink(link: StoredLink) {
  write([link, ...loadLinks().filter(l => l.address !== link.address)])
}

export function removeLink(address: string) {
  write(loadLinks().filter(l => l.address !== address))
}
