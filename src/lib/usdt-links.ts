import { createPublicClient, http, type Hex } from 'viem'
import { polygon } from 'viem/chains'
import {
  feeFor,
  linkAccount,
  POLYGON_CHAIN_ID,
  splitSignature,
  TREASURY_ADDRESS,
  transferTypedData,
  USDT_ABI,
  USDT_ADDRESS,
} from './usdt'

/**
 * Funding and claiming USDT KashLinks. Both ends are gasless: the holder signs an EIP-712
 * meta-transaction and the relayer submits it, so no POL is ever required.
 *
 * Reads go straight to a public Polygon RPC rather than through the wallet, so they work the same
 * in a browser as inside Nimiq Pay.
 */

const RELAY_URL = import.meta.env.VITE_RELAY_URL as string | undefined
export const USDT_ENABLED = !!RELAY_URL

const rpc = createPublicClient({
  chain: polygon,
  transport: http(import.meta.env.VITE_POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com'),
})

export function getUsdtBalance(address: Hex): Promise<bigint> {
  return rpc.readContract({ address: USDT_ADDRESS, abi: USDT_ABI, functionName: 'balanceOf', args: [address] })
}

function getNonce(address: Hex): Promise<bigint> {
  return rpc.readContract({ address: USDT_ADDRESS, abi: USDT_ABI, functionName: 'getNonce', args: [address] })
}

interface SignedMetaTx {
  from: Hex
  functionSignature: Hex
  r: Hex
  s: Hex
  v: number
}

/** Submits one or more signed meta-transactions. Several are executed in the order given. */
async function relay(...transactions: SignedMetaTx[]): Promise<Hex> {
  if (!RELAY_URL) throw new Error('USDT links are not configured.')
  const response = await fetch(RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transactions.length === 1
      ? { ...transactions[0], v: Number(transactions[0].v) }
      : { transactions: transactions.map(t => ({ ...t, v: Number(t.v) })) }),
  })
  const body = await response.json().catch(() => ({})) as { hash?: Hex, hashes?: Hex[], error?: string }
  const hash = body.hash ?? body.hashes?.[0]
  if (!response.ok || !hash) throw new Error(body.error || 'The transfer could not be submitted.')
  return hash
}

/** Signs a transfer with the link's own key. No user interaction: the key is in the link. */
async function signAsLink(secret: string, to: Hex, amount: bigint, nonce: bigint): Promise<SignedMetaTx> {
  const account = linkAccount(secret)
  const { domain, types, primaryType, message, functionSignature } = transferTypedData(
    account.address, to, amount, nonce,
  )
  const signature = await account.signTypedData({ domain, types, primaryType, message })
  return { from: account.address, functionSignature, ...splitSignature(signature) }
}

/** The EVM provider Nimiq Pay injects, or an EIP-1193 wallet in a browser. */
function ethereum(): { request: (args: { method: string, params?: unknown[] }) => Promise<any> } {
  const provider = (window as any).ethereum
  if (!provider) throw new Error('No Ethereum wallet available for USDT.')
  return provider
}

/** Every address the wallet exposes, and what each holds. Nimiq Pay returns more than one. */
export async function getUsdtAccounts(prompt = false): Promise<{ address: Hex, balance: bigint }[]> {
  const provider = (window as any).ethereum
  if (!provider) return []
  const addresses = await provider.request({
    method: prompt ? 'eth_requestAccounts' : 'eth_accounts',
  }) as Hex[]
  return Promise.all(addresses.map(async address => ({ address, balance: await getUsdtBalance(address) })))
}

/**
 * Moves `amount` USDT from the user's wallet into the link address. The user signs; the relayer
 * pays the gas. Requires one signature approval and no POL.
 */
export async function fundUsdtLink(linkAddress: Hex, amount: bigint): Promise<Hex> {
  // The fee rides along into the link and is only split out if someone claims it.
  const total = amount + feeFor(amount)
  const provider = ethereum()
  const accounts = await getUsdtAccounts(true)
  if (!accounts.length) throw new Error('No wallet address available.')
  // The wallet lists several addresses and the first is often empty, so spend from one that can
  // actually cover it rather than whichever happens to come back first.
  const from = (accounts.find(a => a.balance >= total) ?? accounts[0]).address

  const { domain, types, primaryType, message, functionSignature } = transferTypedData(
    from,
    linkAddress,
    total,
    await getNonce(from),
  )
  const signature = await provider.request({
    method: 'eth_signTypedData_v4',
    params: [from, JSON.stringify({
      domain,
      types: { ...types, EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'verifyingContract', type: 'address' },
        { name: 'salt', type: 'bytes32' },
      ] },
      primaryType,
      // JSON has no bigint, and the wallet expects decimal strings for uint256.
      message: { ...message, nonce: message.nonce.toString() },
    })],
  }) as Hex

  return relay({ from, functionSignature, ...splitSignature(signature) })
}

/**
 * Sweeps the link's whole USDT balance to `recipient`, signed with the link's own key. Nobody needs
 * a wallet for this beyond an address to receive it.
 */
export async function claimUsdtLink(secret: string, recipient: Hex, value?: bigint): Promise<Hex> {
  const account = linkAccount(secret)
  const balance = await getUsdtBalance(account.address)
  if (!balance) throw new Error('This KashLink is empty. It was already claimed, or the deposit has not arrived yet.')

  // A link holds the amount it promised plus its fee. Both claiming and reverting resolve the link
  // and take the fee, so the sender gets the amount back rather than the total. Omitting `value`
  // sweeps everything and charges nothing, which is the rescue path for an odd balance.
  const fee = value === undefined ? 0n : feeFor(value)
  const nonce = await getNonce(account.address)
  if (fee === 0n || value === undefined || balance < value + fee) {
    // Also the short-funded case: pay out whatever is there rather than failing, and take no fee.
    return relay(await signAsLink(secret, recipient, balance, nonce))
  }
  // Two transfers signed by the link's own key, so the claimer sees no extra prompt. They must run in
  // order: each meta-transaction consumes the next nonce.
  return relay(
    await signAsLink(secret, recipient, value, nonce),
    await signAsLink(secret, TREASURY_ADDRESS, fee, nonce + 1n),
  )
}

export { POLYGON_CHAIN_ID }
