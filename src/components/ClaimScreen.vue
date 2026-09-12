<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { track } from '../lib/analytics'
import { getKashlinkStatus, hubClaimUrl, nimiqPaySchemeUrl, nimiqPayUrl, type ParsedKashlink, parseKashlink, sweepKashlink } from '../lib/kashlink'
import { formatUsd, lunaToUsd, nimAmount } from '../lib/format'
import { errorMessage, getPayoutAddress, getProvider } from '../lib/provider'
import Icon from './Icon.vue'
import Logo from './Logo.vue'

const props = defineProps<{ secret: string, rate: number | null }>()
const emit = defineEmits<{ done: [] }>()

type State = 'loading' | 'invalid' | 'waiting' | 'unclaimed' | 'claiming' | 'claimed' | 'success'
const state = ref<State>('loading')
const kashlink = ref<ParsedKashlink | null>(null)
const balance = ref(0)
const inNimiqPay = ref<boolean | null>(null)
const error = ref<string | null>(null)
let pollTimer: number | undefined

const amount = computed(() => balance.value || kashlink.value?.value || 0)
const heading = computed(() => ({
  loading: 'Opening KashLink…',
  invalid: 'This KashLink is not valid',
  waiting: 'This KashLink is almost ready',
  unclaimed: 'You received cash!',
  claiming: 'You received cash!',
  claimed: 'This KashLink was already claimed',
  success: 'Cash received!',
})[state.value])

const badgeIcon = computed(() => ({
  loading: 'link',
  invalid: 'alert',
  waiting: 'link',
  unclaimed: 'logo',
  claiming: 'logo',
  claimed: 'check',
  success: 'check',
} as const)[state.value])
const badgeClass = computed(() => ({
  gold: state.value === 'unclaimed' || state.value === 'claiming',
  green: state.value === 'success',
  gray: state.value === 'invalid' || state.value === 'claimed',
}))
const amountClass = computed(() => (state.value === 'claimed' || state.value === 'invalid' ? 'muted' : 'text'))

/**
 * Hand the link straight to Nimiq Pay, so a recipient lands on the claim screen instead of this page.
 * Only on phones, and only once per link per tab: if the app isn't installed the redirect does nothing
 * (or shows a short browser warning) and this page stays visible with its buttons.
 */
function openInNimiqPay() {
  if (!/iphone|ipad|ipod|android/i.test(navigator.userAgent)) return
  try {
    const key = `kashlink-opened:${props.secret}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
  }
  catch {
    return // private mode: don't risk a redirect loop
  }
  location.href = nimiqPaySchemeUrl(props.secret)
}

// A claim in flight or done must not be overwritten by a status refresh.
const isBusy = () => state.value === 'claiming' || state.value === 'success'

async function refresh() {
  if (!kashlink.value || isBusy()) return
  try {
    const result = await getKashlinkStatus(kashlink.value.address)
    if (isBusy()) return
    balance.value = result.balance
    state.value = result.status
  }
  catch (e) {
    error.value = errorMessage(e)
  }
}

onMounted(async () => {
  // Nimiq Pay injects window.nimiqPay before any script runs. Without it this is a regular browser:
  // offer "Open in Nimiq Pay" right away instead of after the provider's 10 s timeout.
  if (!window.nimiqPay) {
    inNimiqPay.value = false
    openInNimiqPay()
  }
  getProvider().then(() => (inNimiqPay.value = true), () => (inNimiqPay.value = false))
  kashlink.value = await parseKashlink(props.secret)
  if (!kashlink.value) {
    state.value = 'invalid'
    return
  }
  await refresh()
  // Keep the status current: the deposit may still be landing, or someone else may claim it first.
  pollTimer = window.setInterval(() => {
    if (state.value === 'waiting' || state.value === 'unclaimed') refresh()
  }, 5000)
})

onUnmounted(() => clearInterval(pollTimer))

async function claim() {
  error.value = null
  state.value = 'claiming'
  try {
    const recipient = await getPayoutAddress()
    await sweepKashlink(props.secret, recipient)
    state.value = 'success'
    if (kashlink.value) track('claimed', amount.value, kashlink.value.address)
  }
  catch (e) {
    error.value = errorMessage(e)
    state.value = 'unclaimed'
    refresh()
  }
}
</script>

<template>
  <main class="screen claim">
    <div class="hero">
      <span class="badge" :class="badgeClass">
        <span v-if="state === 'loading'" class="spinner" />
        <Logo v-else-if="badgeIcon === 'logo'" :size="52" />
        <Icon v-else :name="badgeIcon" :size="34" />
      </span>
      <p class="heading">
        {{ heading }}
      </p>
      <template v-if="kashlink">
        <div class="amount">
          <span :class="amountClass">{{ nimAmount(amount) }}</span><span class="unit">NIM</span>
        </div>
        <p v-if="rate" class="fiat muted">
          ≈ {{ formatUsd(lunaToUsd(amount, rate)) }}
        </p>
        <p v-if="kashlink.message" class="message">
          “{{ kashlink.message }}”
        </p>
      </template>
      <p v-if="state === 'loading'" class="status muted">
        Connecting to the Nimiq network…
      </p>
      <p v-else-if="state === 'waiting'" class="status muted">
        The deposit hasn't arrived yet. This page updates automatically.
      </p>
      <p v-else-if="state === 'success'" class="status muted">
        The NIM is on its way to your Nimiq Pay wallet.
      </p>
    </div>

    <div class="spacer" />

    <p v-if="error" class="error">
      {{ error }}
    </p>

    <template v-if="state === 'unclaimed' || state === 'claiming'">
      <button v-if="inNimiqPay !== false" class="btn btn-primary" :disabled="!inNimiqPay || state === 'claiming'" @click="claim">
        <template v-if="state === 'claiming'">
          <span class="spinner" /> Claiming…
        </template>
        <template v-else-if="inNimiqPay === null">
          <span class="spinner" /> Connecting to Nimiq Pay…
        </template>
        <template v-else>
          Claim cash
        </template>
      </button>
      <template v-else>
        <a class="btn btn-primary" :href="nimiqPayUrl(secret)">Open in Nimiq Pay</a>
        <p class="hint muted">
          No Nimiq Pay? <a :href="hubClaimUrl(secret)">Claim with the Nimiq web wallet</a>
        </p>
      </template>
    </template>

    <button v-else-if="state !== 'loading' && state !== 'waiting'" class="btn btn-primary" @click="emit('done')">
      {{ state === 'success' ? 'Done' : 'Send your own KashLink' }}
    </button>
  </main>
</template>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 48px;
  text-align: center;
}

.badge {
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--nq-light-blue);
  background-image: var(--accent-bg);
  color: #fff;
  box-shadow: var(--shadow-btn);
}

.badge.gold {
  background: var(--nq-gold);
  background-image: var(--gold-bg);
  box-shadow: 0 6px 16px rgba(233, 178, 19, 0.35);
}

.badge.green {
  background: var(--nq-green);
  background-image: var(--green-bg);
  box-shadow: 0 6px 16px rgba(33, 188, 165, 0.35);
}

.badge.gray {
  background: var(--highlight-strong);
  background-image: none;
  color: var(--muted);
  box-shadow: none;
}

.badge .spinner {
  width: 26px;
  height: 26px;
}

.heading {
  margin: 20px 0 4px;
  font-size: 20px;
  font-weight: 800;
}

.amount {
  margin-top: 8px;
  font-size: 48px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.text {
  color: var(--text);
}

.unit {
  margin-left: 8px;
  color: var(--muted-2);
  font-size: 24px;
  font-weight: 700;
}

.fiat {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 600;
}

.message {
  max-width: 300px;
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: var(--radius);
  background: var(--highlight);
  font-size: 15px;
  font-style: italic;
}

.status {
  max-width: 300px;
  margin-top: 20px;
  font-size: 14px;
}

.hint {
  margin: 14px 0 0;
  font-size: 14px;
  text-align: center;
}

.hint a {
  color: var(--text);
  font-weight: 700;
}

.error {
  margin: 0 0 12px;
}
</style>
