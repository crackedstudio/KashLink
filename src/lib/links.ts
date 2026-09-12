import { reactive } from 'vue'
import { track } from './analytics'
import { getKashlinkStatus, sweepKashlink } from './kashlink'
import { loadLinks, saveLink, type StoredLink } from './storage'
import { getPayoutAddress } from './wallet'

/**
 * Status of the links this device created, and returning the money from ones nobody claimed.
 *
 * Nothing here can run on its own: a link is swept with the key held on this device, so an unclaimed
 * link only comes back when the sender opens KashLink again. Putting keys somewhere that could run a
 * timer would mean holding users' money for them, which is not a trade worth making.
 */

export const EXPIRY_DAYS = 7
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000

/** How many status lookups run at once — the public RPC is shared and has no uptime guarantee. */
const CONCURRENCY = 4

export type LinkStatus = 'pending' | 'unclaimed' | 'claimed' | 'reverted'

/** Live status per link address, shared by the screens that show it. */
export const statuses = reactive<Record<string, LinkStatus>>({})

export function isExpired(link: StoredLink): boolean {
  return statuses[link.address] === 'unclaimed' && Date.now() - link.createdAt > EXPIRY_MS
}

async function fetchStatus(link: StoredLink): Promise<LinkStatus> {
  if (link.settled) return link.settled
  const { status } = await getKashlinkStatus(link.address)
  if (status === 'claimed') {
    // Terminal: remember it so this link is never looked up again.
    saveLink({ ...link, settled: 'claimed', settledAt: Date.now() })
    return 'claimed'
  }
  return status === 'unclaimed' ? 'unclaimed' : 'pending'
}

/**
 * Fills in `statuses`, cheapest first: settled links resolve from storage without a request, and the
 * rest are fetched a few at a time. Individual failures leave that link unknown rather than throwing.
 */
export async function refreshStatuses(links: StoredLink[] = loadLinks()): Promise<void> {
  const pending = [...links]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let link = pending.shift(); link; link = pending.shift()) {
      try {
        statuses[link.address] = await fetchStatus(link)
      }
      catch {
        delete statuses[link.address] // unknown; the row shows a dash and can be retried
      }
    }
  })
  await Promise.all(workers)
}

export interface RevertOutcome {
  reverted: number
  failed: number
  luna: number
}

/**
 * Sends the money in these links back to the user's own wallet. Asks for the payout address once,
 * then sweeps one at a time — each sweep is several RPC calls, and a failure must not stop the rest.
 */
export async function revertLinks(links: StoredLink[]): Promise<RevertOutcome> {
  const outcome: RevertOutcome = { reverted: 0, failed: 0, luna: 0 }
  if (!links.length) return outcome
  const payout = await getPayoutAddress()
  for (const link of links) {
    try {
      await sweepKashlink(link.secret, payout)
      saveLink({ ...link, settled: 'reverted', settledAt: Date.now() })
      statuses[link.address] = 'reverted'
      track('reverted', link.value, link.address)
      outcome.reverted++
      outcome.luna += link.value
    }
    catch {
      outcome.failed++
    }
  }
  return outcome
}
