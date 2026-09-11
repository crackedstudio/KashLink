import type * as NimiqCore from '@nimiq/core'

// The in-app light client must be on the same network as Nimiq Pay (testnet is toggled in its dev menu).
export const NETWORK: string = import.meta.env?.VITE_NIMIQ_NETWORK
  || (import.meta.env?.DEV ? 'TestAlbatross' : 'MainAlbatross')

export const IS_MAINNET = NETWORK.toLowerCase() === 'mainalbatross'

let modulePromise: Promise<typeof NimiqCore> | null = null
let clientPromise: Promise<NimiqCore.Client> | null = null

/** Lazily loads the Nimiq WASM module (keys, transactions, light client). */
export function loadNimiq(): Promise<typeof NimiqCore> {
  return modulePromise ??= import('@nimiq/core')
}

/**
 * Light client used for everything the Nimiq Pay provider can't do: reading balances of
 * arbitrary addresses and broadcasting transactions signed by a Cash Link's own key.
 */
export function getClient(): Promise<NimiqCore.Client> {
  clientPromise ??= (async () => {
    const Nimiq = await loadNimiq()
    const config = new Nimiq.ClientConfiguration()
    config.network(NETWORK)
    config.logLevel('warn')
    return Nimiq.Client.create(config.build())
  })().catch((error) => {
    clientPromise = null
    throw error
  })
  return clientPromise
}

export async function getReadyClient(): Promise<NimiqCore.Client> {
  const client = await getClient()
  if (!(await client.isConsensusEstablished())) await client.waitForConsensusEstablished()
  return client
}

/** Balance in luna. */
export async function getBalance(address: string): Promise<number> {
  const client = await getReadyClient()
  const account = await client.getAccount(address)
  return (account as { balance?: number }).balance ?? 0
}

/** Total balance in luna. Nimiq Pay can keep funds on several addresses (e.g. a basic address and an HTLC). */
export async function getTotalBalance(addresses: string[]): Promise<number> {
  const accounts = await (await getReadyClient()).getAccounts(addresses)
  return accounts.reduce((sum, account) => sum + ((account as { balance?: number }).balance ?? 0), 0)
}
