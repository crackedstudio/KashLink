import { createPublicClient, http, type Hex } from 'viem'
import { polygon } from 'viem/chains'
import {
  linkAccount,
  POLYGON_CHAIN_ID,
  splitSignature,
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

async function relay(tx: SignedMetaTx): Promise<Hex> {
  if (!RELAY_URL) throw new Error('USDT links are not configured.')
  const response = await fetch(RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...tx, v: Number(tx.v) }),
  })
  const body = await response.json().catch(() => ({})) as { hash?: Hex, error?: string }
  if (!response.ok || !body.hash) throw new Error(body.error || 'The transfer could not be submitted.')
  return body.hash
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
  const provider = ethereum()
  const accounts = await getUsdtAccounts(true)
  if (!accounts.length) throw new Error('No wallet address available.')
  // The wallet lists several addresses and the first is often empty, so spend from one that can
  // actually cover it rather than whichever happens to come back first.
  const from = (accounts.find(a => a.balance >= amount) ?? accounts[0]).address

  const { domain, types, primaryType, message, functionSignature } = transferTypedData(
    from,
    linkAddress,
    amount,
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
export async function claimUsdtLink(secret: string, recipient: Hex): Promise<Hex> {
  const account = linkAccount(secret)
  const balance = await getUsdtBalance(account.address)
  if (!balance) throw new Error('This KashLink is empty. It was already claimed, or the deposit has not arrived yet.')

  const { domain, types, primaryType, message, functionSignature } = transferTypedData(
    account.address,
    recipient,
    balance,
    await getNonce(account.address),
  )
  const signature = await account.signTypedData({ domain, types, primaryType, message })
  return relay({ from: account.address, functionSignature, ...splitSignature(signature) })
}

export { POLYGON_CHAIN_ID }
