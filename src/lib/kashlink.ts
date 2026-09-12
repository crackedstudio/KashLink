import { getAccounts, getHeadHeight, getNetworkId, getTransactions, loadNimiq, sendTransaction } from './nimiq'
import type { Token } from './storage'

/*
 * A KashLink is a throwaway Nimiq address. The link's #fragment carries its private key
 * (fragments are never sent to a server), so whoever has the link can move the funds.
 *
 * The encoding is the same as the Nimiq Hub's cashlinks (hub/src/lib/Cashlink.ts):
 *   base64url( privateKey[32] | value uint64 BE [| messageLength uint8 | message [| theme uint8]] )
 * so every link can also be claimed at hub.nimiq.com/cashlink by people without Nimiq Pay.
 */

/** Recipient data the Hub attaches to claim transactions ('LINK' + 63 per char), so wallets label them. */
const CLAIM_DATA = new Uint8Array([0, 139, 136, 141, 138])

export interface ParsedKashlink {
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

export function encodeKashlink(privateKey: Uint8Array, value: number): string {
  const bytes = new Uint8Array(40)
  bytes.set(privateKey, 0)
  new DataView(bytes.buffer).setBigUint64(32, BigInt(value))
  return toBase64Url(bytes)
}

async function keyPairFromSecret(secret: string) {
  const Nimiq = await loadNimiq()
  const bytes = fromBase64Url(secret)
  if (bytes.length < 40) throw new Error('Invalid KashLink')
  return { Nimiq, bytes, keyPair: Nimiq.KeyPair.derive(new Nimiq.PrivateKey(bytes.slice(0, 32))) }
}

export async function createKashlink(value: number): Promise<ParsedKashlink> {
  const Nimiq = await loadNimiq()
  const keyPair = Nimiq.KeyPair.generate()
  return {
    secret: encodeKashlink(keyPair.privateKey.serialize(), value),
    address: keyPair.toAddress().toUserFriendlyAddress(),
    value,
    message: '',
  }
}

export async function parseKashlink(secret: string): Promise<ParsedKashlink | null> {
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
 * Moves the whole balance of the KashLink to `recipient`, signed with the link's own key.
 * Used both for claiming (recipient = claimer) and reverting (recipient = creator).
 * Returns the transaction hash.
 */
export async function sweepKashlink(secret: string, recipient: string): Promise<string> {
  const { Nimiq, keyPair } = await keyPairFromSecret(secret)
  const sender = keyPair.toAddress()
  const [[account, recipientAccount], height, networkId] = await Promise.all([
    getAccounts([sender.toUserFriendlyAddress(), recipient]),
    getHeadHeight(),
    getNetworkId(),
  ])
  if (!account.balance) throw new Error('This KashLink is empty. It was already claimed or reverted, or the deposit is not confirmed yet.')
  // Transfers into contracts (HTLC, vesting, staking) get included in a block but fail, and the funds stay put.
  if (recipientAccount.type !== 'basic') throw new Error('This address can\'t receive a KashLink.')

  const tx = Nimiq.TransactionBuilder.newBasicWithData(
    sender,
    Nimiq.Address.fromUserFriendlyAddress(recipient),
    CLAIM_DATA,
    BigInt(account.balance),
    0n,
    height,
    networkId,
  )
  keyPair.signTransaction(tx)
  return sendTransaction(tx)
}

/** 'unclaimed' = has funds, 'claimed' = funds were moved out, 'waiting' = not funded (yet). */
export async function getKashlinkStatus(address: string): Promise<{ status: 'unclaimed' | 'claimed' | 'waiting', balance: number }> {
  const [{ balance }] = await getAccounts([address])
  if (balance > 0) return { status: 'unclaimed', balance }
  const normalized = address.replace(/\s/g, '')
  const movedOut = (await getTransactions(address)).some(
    tx => tx.sender.replace(/\s/g, '') === normalized && tx.executionResult !== false,
  )
  return { status: movedOut ? 'claimed' : 'waiting', balance }
}

/**
 * The mini app's own URL for this link. USDT links live under /u so the claim screen knows which
 * chain to talk to before it touches the secret; the key itself stays in the fragment, which is
 * never sent to any server.
 */
export function linkUrl(secret: string, token: Token = 'nim'): string {
  const base = import.meta.env.VITE_PUBLIC_URL || `${location.origin}${location.pathname}`
  const root = base.replace(/#.*$/, '').replace(/u\/?$/, '').replace(/\/?$/, '/')
  return `${root}${token === 'usdt' ? 'u' : ''}#${secret}`
}

/**
 * The same link wrapped as a nimpay.app "open" URL. nimpay.app is registered as a Universal Link (iOS) and
 * App Link (Android) domain for Nimiq Pay, so on a phone with the app installed the OS hands the tap straight
 * to Nimiq Pay, which loads the mini app with the #key intact (tested on iOS) — no browser in between.
 * Without the app, nimpay.app shows an install page, but only for mini apps listed in the Nimiq Pay directory
 * (github.com/nimiq/awesome); unlisted hosts get a 404 there.
 */
export function nimiqPayUrl(secret: string, token: Token = 'nim'): string {
  const url = new URL(linkUrl(secret, token))
  const path = url.pathname === '/' ? '' : url.pathname
  return `https://nimpay.app/miniapps/open/${url.host}${path}#${secret}`
}

/**
 * The link that gets shared. Defaults to the nimpay.app link so it opens directly in Nimiq Pay; set
 * VITE_DIRECT_LINKS=false to share the plain mini app URL instead (until KashLink is in the directory,
 * that keeps a working claim page for recipients without Nimiq Pay).
 */
export function shareUrl(secret: string, token: Token = 'nim'): string {
  return import.meta.env.VITE_DIRECT_LINKS === 'false' ? linkUrl(secret, token) : nimiqPayUrl(secret, token)
}

/**
 * Custom scheme for the same link. Apple and Google only hand an https link to the app on a real tap,
 * so this is the form that also works for an automatic redirect.
 */
export function nimiqPaySchemeUrl(secret: string, token: Token = 'nim'): string {
  return `nimiqpay://miniapp?url=${encodeURIComponent(linkUrl(secret, token))}`
}

