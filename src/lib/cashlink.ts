import { getReadyClient, IS_MAINNET, loadNimiq } from './nimiq'

/*
 * A Cash Link is a throwaway Nimiq address. The link's #fragment carries its private key
 * (fragments are never sent to a server), so whoever has the link can move the funds.
 *
 * The encoding is the same as the Nimiq Hub's cashlinks (hub/src/lib/Cashlink.ts):
 *   base64url( privateKey[32] | value uint64 BE [| messageLength uint8 | message [| theme uint8]] )
 * so every link can also be claimed at hub.nimiq.com/cashlink by people without Nimiq Pay.
 */

/** Recipient data the Hub attaches to claim transactions ('LINK' + 63 per char), so wallets label them. */
const CLAIM_DATA = new Uint8Array([0, 139, 136, 141, 138])

export interface ParsedCashlink {
  secret: string
  address: string
  /** Amount in luna the link was created with. */
  value: number
  message: string
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_')
}

function fromBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/~/g, '').replace(/\./g, '=').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  base64 += '='.repeat((4 - (base64.length % 4)) % 4)
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

export function encodeCashlink(privateKey: Uint8Array, value: number): string {
  const bytes = new Uint8Array(40)
  bytes.set(privateKey, 0)
  new DataView(bytes.buffer).setBigUint64(32, BigInt(value))
  return toBase64Url(bytes)
}

async function keyPairFromSecret(secret: string) {
  const Nimiq = await loadNimiq()
  const bytes = fromBase64Url(secret)
  if (bytes.length < 40) throw new Error('Invalid Cash Link')
  return { Nimiq, bytes, keyPair: Nimiq.KeyPair.derive(new Nimiq.PrivateKey(bytes.slice(0, 32))) }
}

export async function createCashlink(value: number): Promise<ParsedCashlink> {
  const Nimiq = await loadNimiq()
  const keyPair = Nimiq.KeyPair.generate()
  return {
    secret: encodeCashlink(keyPair.privateKey.serialize(), value),
    address: keyPair.toAddress().toUserFriendlyAddress(),
    value,
    message: '',
  }
}

export async function parseCashlink(secret: string): Promise<ParsedCashlink | null> {
  try {
    const { bytes, keyPair } = await keyPairFromSecret(secret)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const value = Number(view.getBigUint64(32))
    const message = bytes.length > 41 ? new TextDecoder().decode(bytes.subarray(41, 41 + bytes[40])) : ''
    return { secret, address: keyPair.toAddress().toUserFriendlyAddress(), value, message }
  }
  catch {
    return null
  }
}

/**
 * Moves the whole balance of the Cash Link to `recipient`, signed with the link's own key.
 * Used both for claiming (recipient = claimer) and reverting (recipient = creator).
 * Returns the transaction hash.
 */
export async function sweepCashlink(secret: string, recipient: string): Promise<string> {
  const [{ Nimiq, keyPair }, client] = await Promise.all([keyPairFromSecret(secret), getReadyClient()])
  const sender = keyPair.toAddress()
  const account = await client.getAccount(sender)
  const balance = (account as { balance?: number }).balance ?? 0
  if (!balance) throw new Error('This Cash Link is empty. It was already claimed or reverted, or the deposit is not confirmed yet.')
  // Transfers into contracts (HTLC, vesting, staking) get included in a block but fail, and the funds stay put.
  if ((await client.getAccount(recipient)).type !== 'basic') throw new Error('This address can\'t receive a Cash Link.')

  const [height, networkId] = await Promise.all([client.getHeadHeight(), client.getNetworkId()])
  const tx = Nimiq.TransactionBuilder.newBasicWithData(
    sender,
    Nimiq.Address.fromUserFriendlyAddress(recipient),
    CLAIM_DATA,
    BigInt(balance),
    0n,
    height,
    networkId,
  )
  keyPair.signTransaction(tx)

  const details = await client.sendTransaction(tx)
  if (details.executionResult === false || details.state === 'invalidated' || details.state === 'expired') {
    throw new Error('The network rejected the transaction. Please try again.')
  }
  return details.transactionHash
}

/** 'unclaimed' = has funds, 'claimed' = funds were moved out, 'waiting' = not funded (yet). */
export async function getCashlinkStatus(address: string): Promise<{ status: 'unclaimed' | 'claimed' | 'waiting', balance: number }> {
  const client = await getReadyClient()
  const account = await client.getAccount(address)
  const balance = (account as { balance?: number }).balance ?? 0
  if (balance > 0) return { status: 'unclaimed', balance }
  const txs = await client.getTransactionsByAddress(address, null, null, null, 10)
  const normalized = address.replace(/\s/g, '')
  const movedOut = txs.some(tx => tx.sender.replace(/\s/g, '') === normalized && tx.executionResult !== false)
  return { status: movedOut ? 'claimed' : 'waiting', balance }
}

export function linkUrl(secret: string): string {
  const base = import.meta.env.VITE_PUBLIC_URL || `${location.origin}${location.pathname}`
  return `${base.replace(/#.*$/, '')}#${secret}`
}

/** Fallback for recipients outside Nimiq Pay: the Nimiq Hub understands the same link format. */
export function hubClaimUrl(secret: string): string {
  return `${IS_MAINNET ? 'https://hub.nimiq.com' : 'https://hub.nimiq-testnet.com'}/cashlink/#${secret}`
}
