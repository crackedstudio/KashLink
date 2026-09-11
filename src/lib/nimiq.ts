import type * as NimiqCore from '@nimiq/core'

// The in-app light client must be on the same network as Nimiq Pay (testnet is toggled in its dev menu).
export const NETWORK: string = import.meta.env?.VITE_NIMIQ_NETWORK
  || (import.meta.env?.DEV ? 'TestAlbatross' : 'MainAlbatross')

export const IS_MAINNET = NETWORK.toLowerCase() === 'mainalbatross'

// getNetworkId is disabled on public RPC servers; mainnet's id is fixed.
const MAINNET_NETWORK_ID = 24

// Reads and broadcasts go to a JSON-RPC server (~1 s per call) instead of the light client, which has to
// download ~8 MB of WASM and then needs ~20 s to reach consensus. The public server is listed in the Nimiq
// docs but has no uptime guarantee: set VITE_NIMIQ_RPC_URL to your own node, or to '' to disable RPC.
const RPC_URL: string = import.meta.env?.VITE_NIMIQ_RPC_URL ?? (IS_MAINNET ? 'https://rpc.nimiqwatch.com' : '')
export const USES_RPC = !!RPC_URL

let modulePromise: Promise<typeof NimiqCore> | null = null
let clientPromise: Promise<NimiqCore.Client> | null = null

/** Lazily loads the Nimiq WASM module (keys, transactions, light client). */
export function loadNimiq(): Promise<typeof NimiqCore> {
  return modulePromise ??= import('@nimiq/core')
}

/** Light client: the fallback when no RPC server is configured or it fails. */
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

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      signal: controller.signal,
    })
    const json = await response.json() as { result?: { data: T }, error?: unknown }
    if (!json.result) throw new Error(`RPC ${method} failed: ${JSON.stringify(json.error)}`)
    return json.result.data
  }
  finally {
    clearTimeout(timer)
  }
}

async function withFallback<T>(fromRpc: () => Promise<T>, fromClient: (client: NimiqCore.Client) => Promise<T>): Promise<T> {
  if (USES_RPC) {
    try {
      return await fromRpc()
    }
    catch (error) {
      console.warn('RPC failed, falling back to the light client', error)
    }
  }
  return fromClient(await getReadyClient())
}

export interface ChainAccount {
  type: string
  /** Luna. */
  balance: number
}

export interface ChainTransaction {
  hash: string
  sender: string
  recipient: string
  value: number
  executionResult?: boolean
}

/** Same order as `addresses`. */
export function getAccounts(addresses: string[]): Promise<ChainAccount[]> {
  return withFallback(
    () => Promise.all(addresses.map(address => rpc<ChainAccount>('getAccountByAddress', [address])))
      .then(accounts => accounts.map(({ type, balance }) => ({ type, balance }))),
    async client => (await client.getAccounts(addresses))
      .map(account => ({ type: account.type, balance: (account as { balance?: number }).balance ?? 0 })),
  )
}

/** Total balance in luna. Nimiq Pay keeps funds on several addresses (a basic address and an HTLC). */
export async function getTotalBalance(addresses: string[]): Promise<number> {
  return (await getAccounts(addresses)).reduce((sum, account) => sum + account.balance, 0)
}

export function getHeadHeight(): Promise<number> {
  return withFallback(() => rpc<number>('getBlockNumber', []), client => client.getHeadHeight())
}

export async function getNetworkId(): Promise<number> {
  return IS_MAINNET ? MAINNET_NETWORK_ID : (await getReadyClient()).getNetworkId()
}

export function getTransactions(address: string, max = 10): Promise<ChainTransaction[]> {
  return withFallback(
    async () => (await rpc<{ hash: string, from: string, to: string, value: number, executionResult?: boolean }[]>(
      'getTransactionsByAddress',
      [address, max, null],
    )).map(tx => ({ hash: tx.hash, sender: tx.from, recipient: tx.to, value: tx.value, executionResult: tx.executionResult })),
    async client => (await client.getTransactionsByAddress(address, null, null, null, max))
      .map(tx => ({ hash: tx.transactionHash, sender: tx.sender, recipient: tx.recipient, value: tx.value, executionResult: tx.executionResult })),
  )
}

class TransactionFailedError extends Error {}

/** Waits until the transaction is in a block and throws if it failed there (included but not executed). */
async function confirmExecuted(hash: string) {
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1500))
    const tx = await rpc<{ executionResult?: boolean }>('getTransactionByHash', [hash]).catch(() => null)
    if (!tx) continue // not in a block yet
    if (tx.executionResult === false) throw new TransactionFailedError('The network rejected the transaction. Your NIM did not move.')
    return
  }
  // Still pending after ~20 s; it can still go through, so don't report a failure.
}

/** Broadcasts a signed transaction and resolves with its hash once it went through. */
export async function sendTransaction(tx: NimiqCore.Transaction): Promise<string> {
  if (USES_RPC) {
    try {
      const hash = await rpc<string>('pushTransaction', [tx.toHex()])
      await confirmExecuted(hash)
      return hash
    }
    catch (error) {
      if (error instanceof TransactionFailedError) throw error
      console.warn('RPC broadcast failed, retrying via the light client', error)
    }
  }
  const details = await (await getReadyClient()).sendTransaction(tx)
  if (details.executionResult === false || details.state === 'invalidated' || details.state === 'expired') {
    throw new Error('The network rejected the transaction. Your NIM did not move.')
  }
  return details.transactionHash
}
