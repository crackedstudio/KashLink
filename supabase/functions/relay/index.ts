// KashLink gas relayer — Supabase Edge Function (Deno).
//
// Polygon only accepts POL for gas, and a KashLink address never holds any. Holders instead sign an
// EIP-712 meta-transaction off-chain, and this function submits it and pays the gas from its own
// wallet. That is the only reason it exists: neither sender nor recipient ever needs POL.
//
// It is paying real money for strangers, so it relays exactly one kind of call — a USDT transfer —
// and simulates every request first, refusing anything that would revert. A failed simulation costs
// nothing; a submitted failing transaction would cost gas for no result.
//
// Deploy:  supabase functions deploy relay --no-verify-jwt
// Secrets: supabase secrets set RELAYER_PRIVATE_KEY=0x...  (never commit this)

import { createPublicClient, createWalletClient, decodeFunctionData, http, isAddress } from 'npm:viem@2'
import { privateKeyToAccount } from 'npm:viem@2/accounts'
import { polygon } from 'npm:viem@2/chains'

const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const TRANSFER_SELECTOR = '0xa9059cbb'
/** Below this the gas costs more than the transfer is worth, and it is almost certainly abuse. */
const MIN_UNITS = 100_000n // 0.10 USDT

const ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    name: 'executeMetaTransaction',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'userAddress', type: 'address' },
      { name: 'functionSignature', type: 'bytes' },
      { name: 'sigR', type: 'bytes32' },
      { name: 'sigS', type: 'bytes32' },
      { name: 'sigV', type: 'uint8' },
    ],
    outputs: [{ type: 'bytes' }],
  },
] as const

const RPC_URL = Deno.env.get('POLYGON_RPC_URL') ?? 'https://polygon-bor-rpc.publicnode.com'
const publicClient = createPublicClient({ chain: polygon, transport: http(RPC_URL) })

function relayerAccount() {
  const key = Deno.env.get('RELAYER_PRIVATE_KEY')
  if (!key) throw new Error('RELAYER_PRIVATE_KEY is not set')
  return privateKeyToAccount(key as `0x${string}`)
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    const { from, functionSignature, r, s, v } = await req.json()

    if (!isAddress(from)) return json({ error: 'bad from address' }, 400)
    if (typeof functionSignature !== 'string' || !functionSignature.startsWith(TRANSFER_SELECTOR)) {
      return json({ error: 'only USDT transfers are relayed' }, 400)
    }

    // Decode so the amount and recipient are known values, not whatever was handed to us.
    const { args } = decodeFunctionData({ abi: ABI, data: functionSignature as `0x${string}` })
    const [to, amount] = args as [string, bigint]
    if (!isAddress(to)) return json({ error: 'bad recipient' }, 400)
    if (amount < MIN_UNITS) return json({ error: 'amount too small to relay' }, 400)

    // The sender must actually hold it — otherwise the transfer reverts and the gas is wasted.
    const balance = await publicClient.readContract({
      address: USDT_ADDRESS, abi: ABI, functionName: 'balanceOf', args: [from as `0x${string}`],
    })
    if (balance < amount) return json({ error: 'insufficient USDT balance' }, 400)

    const account = relayerAccount()
    const call = {
      address: USDT_ADDRESS as `0x${string}`,
      abi: ABI,
      functionName: 'executeMetaTransaction' as const,
      args: [from as `0x${string}`, functionSignature as `0x${string}`, r as `0x${string}`, s as `0x${string}`, Number(v)] as const,
      account,
    }

    // Refuse anything that would revert — a bad signature, a replayed nonce, a frozen account.
    // This is the main defence against being made to burn gas for nothing.
    try {
      await publicClient.simulateContract(call)
    }
    catch (error) {
      return json({ error: 'transaction would fail', detail: String((error as Error).message).slice(0, 200) }, 400)
    }

    const wallet = createWalletClient({ account, chain: polygon, transport: http(RPC_URL) })
    const hash = await wallet.writeContract(call)
    return json({ hash })
  }
  catch (error) {
    return json({ error: String((error as Error).message).slice(0, 200) }, 500)
  }
})
