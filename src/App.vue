<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AmountScreen from './components/AmountScreen.vue'
import ClaimScreen from './components/ClaimScreen.vue'
import IntroScreen from './components/IntroScreen.vue'
import LinksSheet from './components/LinksSheet.vue'
import ReadySheet from './components/ReadySheet.vue'
import ReviewScreen from './components/ReviewScreen.vue'
import { track } from './lib/analytics'
import { createKashlink } from './lib/kashlink'
import { isExpired, refreshStatuses } from './lib/links'
import { getNimUsdRate } from './lib/fiat'
import type { Currency } from './lib/format'
import { getClient, loadNimiq, USES_RPC } from './lib/nimiq'
import { errorMessage, isUserRejection } from './lib/provider'
import { fundKashlink, getSpendableBalance, inNimiqPay } from './lib/wallet'
import { loadCachedBalance, loadLinks, removeLink, saveCachedBalance, saveLink, type StoredLink, type Token } from './lib/storage'
import { createUsdtLink } from './lib/usdt'
import { fundUsdtLink, getUsdtAccounts } from './lib/usdt-links'

type Screen = 'intro' | 'amount' | 'review' | 'claim'

function secretFromHash(): string {
  const raw = location.hash.slice(1)
  try {
    return decodeURIComponent(raw)
  }
  catch {
    return raw
  }
}

/** USDT links are served from /u, so the chain is known before the key is read. */
const claimToken: Token = location.pathname.replace(/\/+$/, '').endsWith('/u') ? 'usdt' : 'nim'
const claimSecret = ref(secretFromHash())
const screen = ref<Screen>(claimSecret.value ? 'claim' : 'intro')

const rate = ref<number | null>(null)
const balance = ref<number | null>(null)
const balanceError = ref<string | null>(null)
// TEMP: shows which wallet addresses were checked while debugging the USDT balance.
const diagnostics = ref<string[]>([])
const amountLuna = ref(0)
const amountCurrency = ref<Currency>('NIM')
const token = ref<Token>('nim')
/** Generated when the review screen opens; funded when the user taps Send. */
const pendingLink = ref<{ secret: string, address: string, value: number } | null>(null)
const sending = ref(false)
const sendError = ref<string | null>(null)
const links = ref<StoredLink[]>(loadLinks())
const readyLink = ref<StoredLink | null>(null)
const showLinks = ref(false)
const expiredCount = computed(() => links.value.filter(isExpired).length)

onMounted(() => {
  // Tapping another KashLink while KashLink is already open in Nimiq Pay only changes the #hash,
  // without reloading the page, so switch to that link's claim screen here.
  window.addEventListener('hashchange', () => {
    const secret = secretFromHash()
    if (!secret) return
    claimSecret.value = secret
    readyLink.value = null
    showLinks.value = false
    screen.value = 'claim'
  })
  // Check the sender's own links in the background, so an expired one can be flagged on the intro
  // screen. Skipped when opening someone else's link, where these are not ours to care about.
  if (screen.value !== 'claim' && links.value.length) {
    refreshStatuses(links.value).catch(() => {})
  }
  // Compile the key/transaction WASM now so creating a link is instant later.
  loadNimiq().catch(error => console.warn('Nimiq module failed to load', error))
  // Without an RPC server, balances come from the light client: start syncing it right away.
  if (!USES_RPC) getClient().catch(error => console.warn('Nimiq client failed to start', error))
  getNimUsdRate().then(value => (rate.value = value))
})

/**
 * Guards against a slow lookup landing after the user already switched token: without it a NIM
 * balance can arrive late and be rendered as USDT, which is off by a factor of ten.
 */
let balanceRequest = 0

async function loadBalance() {
  const request = ++balanceRequest
  balanceError.value = null
  if (token.value === 'usdt') {
    // eth_accounts does not prompt; without a known address the Hub/wallet enforces the balance instead.
    balance.value = null
    try {
      // Nimiq Pay hands out no addresses until permission is granted, so ask for it. Choosing USDT
      // is a deliberate tap, which is the right moment for that prompt. The wallet lists several
      // addresses and the funds are not necessarily on the first, so total them.
      const accounts = await getUsdtAccounts(true)
      if (request !== balanceRequest) return
      diagnostics.value = accounts.length
        ? accounts.map(a => `${a.address.slice(0, 6)}…${a.address.slice(-4)}: ${Number(a.balance) / 1e6} USDT`)
        : ['wallet returned no addresses']
      if (accounts.length) balance.value = Number(accounts.reduce((sum, a) => sum + a.balance, 0n))
    }
    catch {
      // leave it unknown rather than blocking the screen
    }
    return
  }
  // Show the last known NIM balance instantly; the fresh one replaces it a moment later.
  balance.value = loadCachedBalance()
  try {
    const spendable = await getSpendableBalance()
    if (request !== balanceRequest) return
    balance.value = spendable
    if (spendable !== null) saveCachedBalance(spendable)
  }
  catch (error) {
    if (request !== balanceRequest) return
    balance.value = null
    balanceError.value = errorMessage(error)
  }
}

function startCreate() {
  screen.value = 'amount'
  loadBalance()
  if (!rate.value) getNimUsdRate().then(value => (rate.value = value))
}

async function onAmount(luna: number, currency: Currency) {
  amountLuna.value = luna
  amountCurrency.value = currency
  sendError.value = null
  screen.value = 'review'
  // Generate the link now rather than inside send(). In a browser the wallet is a Hub popup, and an
  // await between the click and opening it can cost the user-activation that lets the popup through.
  pendingLink.value = null
  try {
    pendingLink.value = token.value === 'usdt'
      ? (({ secret, address, value }) => ({ secret, address, value: Number(value) }))(createUsdtLink(BigInt(luna)))
      : await createKashlink(luna)
  }
  catch (error) {
    sendError.value = errorMessage(error)
  }
}

async function send() {
  const kashlink = pendingLink.value
  if (!kashlink) return
  sending.value = true
  sendError.value = null
  const link: StoredLink = {
    secret: kashlink.secret,
    address: kashlink.address,
    value: kashlink.value,
    token: token.value,
    createdAt: Date.now(),
  }
  try {
    // Persist the key before any NIM moves, so the link can always be reverted.
    saveLink(link)
    const funded = {
      ...link,
      fundingTx: token.value === 'usdt'
        ? await fundUsdtLink(link.address as `0x${string}`, BigInt(link.value))
        : await fundKashlink(link.address, link.value),
    }
    saveLink(funded)
    track('created', funded.value, funded.address)
    links.value = loadLinks()
    readyLink.value = funded
    pendingLink.value = null
    screen.value = 'intro'
  }
  catch (error) {
    // Nothing was sent when the user declined, so the unused key can go.
    if (isUserRejection(error)) removeLink(link.address)
    sendError.value = errorMessage(error)
  }
  finally {
    sending.value = false
  }
}

function openLink(link: StoredLink) {
  showLinks.value = false
  readyLink.value = link
}

function closeReady() {
  readyLink.value = null
  links.value = loadLinks()
}

function finishClaim() {
  history.replaceState(null, '', location.pathname + location.search)
  claimSecret.value = ''
  screen.value = 'intro'
}
</script>

<template>
  <ClaimScreen v-if="screen === 'claim'" :key="claimSecret" :secret="claimSecret" :token="claimToken" :rate @done="finishClaim" />
  <IntroScreen
    v-else-if="screen === 'intro'" :link-count="links.length" :expired-count="expiredCount"
    @next="startCreate" @show-links="showLinks = true"
  />
  <AmountScreen
    v-else-if="screen === 'amount'" :balance :balance-error :rate :token :diagnostics
    :balance-known="token === 'nim' ? inNimiqPay() : balance !== null"
    @back="screen = 'intro'" @retry="loadBalance" @continue="onAmount"
    @update:token="token = $event; loadBalance()"
  />
  <ReviewScreen
    v-else :luna="amountLuna" :currency="amountCurrency" :token :rate :sending :error="sendError"
    @back="screen = 'amount'" @send="send"
  />

  <LinksSheet v-if="showLinks" :links @open="openLink" @changed="links = loadLinks()" @close="showLinks = false" />
  <ReadySheet v-if="readyLink" :key="readyLink.address" :link="readyLink" :rate @close="closeReady" />
</template>
