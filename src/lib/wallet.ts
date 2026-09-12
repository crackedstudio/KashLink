import HubApi from '@nimiq/hub-api'
import { getAccounts, IS_MAINNET } from './nimiq'
import { getProvider, getUserAddresses, unwrap } from './provider'

/**
 * One wallet interface over two very different hosts:
 *
 *  - inside Nimiq Pay, the injected provider signs (native approval dialogs)
 *  - in a normal browser, the Nimiq Hub signs (a popup on hub.nimiq.com)
 *
 * Claiming needs neither: a KashLink is swept with its own key, so the wallet is only ever asked
 * for money to fund a link, or for an address to pay out to.
 */

const APP_NAME = 'KashLink'

// The Hub's default endpoint is derived from our own domain (hub.<our-domain>), which does not
// exist, so it always has to be passed explicitly.
const HUB_ENDPOINT = IS_MAINNET ? 'https://hub.nimiq.com' : 'https://hub.nimiq-testnet.com'

let hub: HubApi | null = null
function getHub(): HubApi {
  return hub ??= new HubApi(HUB_ENDPOINT)
}

/**
 * Nimiq Pay injects both of these before any page script runs, so this is reliable immediately —
 * no waiting on the SDK's init() timeout. Either one counts: getting this wrong inside Nimiq Pay
 * would try to open a Hub popup in a WebView that has a perfectly good wallet already.
 */
export function inNimiqPay(): boolean {
  return !!(window.nimiqPay || window.nimiq)
}

/**
 * Where a claim or revert should pay out. Never a contract: paying into one is accepted by the
 * network and then fails, which is how 2 NIM once got stuck in an HTLC.
 */
export async function getPayoutAddress(): Promise<string> {
  if (inNimiqPay()) {
    const addresses = await getUserAddresses()
    const accounts = await getAccounts(addresses)
    const index = accounts.findIndex(account => account.type === 'basic')
    if (index === -1) throw new Error('Your wallet has no regular Nimiq address to receive NIM.')
    return addresses[index]
  }
  const chosen = await getHub().chooseAddress({ appName: APP_NAME, disableContracts: true })
  return chosen.address
}

/**
 * Moves `value` luna from the user's wallet into the link's address. Returns the funding
 * transaction hash.
 *
 * In a browser this opens the Hub in a popup, so it must be called straight from a click handler:
 * an await in between can cost the user-activation that lets the popup open. The link is therefore
 * generated before this is called, never inside it.
 */
export async function fundKashlink(address: string, value: number): Promise<string> {
  if (inNimiqPay()) {
    const provider = await getProvider()
    return unwrap(await provider.sendBasicTransactionWithData({
      recipient: address,
      value,
      data: APP_NAME,
    }))
  }
  const signed = await getHub().checkout({
    appName: APP_NAME,
    recipient: address,
    value,
    extraData: APP_NAME,
  })
  return (signed as { hash: string }).hash
}

/**
 * Spendable balance in luna, or null when it cannot be known up front. In a browser the user has
 * not chosen an account yet, and the Hub shows their balance and enforces it during checkout, so
 * the amount screen simply does not show one.
 */
export async function getSpendableBalance(): Promise<number | null> {
  if (!inNimiqPay()) return null
  const accounts = await getAccounts(await getUserAddresses())
  return accounts.reduce((sum, account) => sum + account.balance, 0)
}
