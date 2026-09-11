import { type ErrorResponse, init, type NimiqProvider } from '@nimiq/mini-app-sdk'
import { getReadyClient } from './nimiq'

let providerPromise: Promise<NimiqProvider> | null = null
let userAddressesPromise: Promise<string[]> | null = null

export class ProviderError extends Error {
  type: string

  constructor(message: string, type: string) {
    super(message)
    this.type = type
  }
}

/** Resolves once Nimiq Pay has injected its provider; rejects when opened outside Nimiq Pay. */
export function getProvider(): Promise<NimiqProvider> {
  providerPromise ??= init({ timeout: 10_000 }).catch(() => {
    providerPromise = null
    throw new Error('Open this mini app inside Nimiq Pay to continue.')
  })
  return providerPromise
}

/** Provider methods resolve with `{ error }` instead of throwing; turn that into an exception. */
export function unwrap<T>(result: T | ErrorResponse): T {
  if (result && typeof result === 'object' && 'error' in result) {
    const { message, type } = (result as ErrorResponse).error ?? {}
    throw new ProviderError(message || 'Request failed', type || 'unknown')
  }
  return result as T
}

/** All of the user's Nimiq addresses. Asks for permission once per session. */
export function getUserAddresses(): Promise<string[]> {
  userAddressesPromise ??= (async () => {
    const provider = await getProvider()
    const accounts = unwrap(await provider.listAccounts())
    if (!accounts.length) throw new Error('No Nimiq account found in your wallet.')
    return accounts
  })().catch((error) => {
    userAddressesPromise = null
    throw error
  })
  return userAddressesPromise
}

/**
 * The user's address that can receive NIM (claims and reverts go here). Nimiq Pay also lists contract
 * addresses, e.g. the HTLC it keeps the balance in; transfers into those are included but fail on-chain.
 */
export async function getPayoutAddress(): Promise<string> {
  const addresses = await getUserAddresses()
  const accounts = await (await getReadyClient()).getAccounts(addresses)
  const index = accounts.findIndex(account => account.type === 'basic')
  if (index === -1) throw new Error('Your wallet has no regular Nimiq address to receive NIM.')
  return addresses[index]
}

export function isUserRejection(error: unknown): boolean {
  const { type = '', name = '', message = '' } = (error ?? {}) as { type?: string, name?: string, message?: string }
  return /denied|reject|cancel|declin/i.test(`${type} ${name} ${message}`)
}

export function errorMessage(error: unknown): string {
  if (isUserRejection(error)) return 'Request cancelled.'
  if (error instanceof Error) return error.message
  return String(error)
}
