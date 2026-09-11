<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getCashlinkStatus, hubClaimUrl, type ParsedCashlink, parseCashlink, sweepCashlink } from '../lib/cashlink'
import { formatUsd, lunaToUsd, nimAmount } from '../lib/format'
import { getReadyClient } from '../lib/nimiq'
import { errorMessage, getPayoutAddress, getProvider } from '../lib/provider'
import Icon from './Icon.vue'

const props = defineProps<{ secret: string, rate: number | null }>()
const emit = defineEmits<{ done: [] }>()

type State = 'loading' | 'invalid' | 'waiting' | 'unclaimed' | 'claiming' | 'claimed' | 'success'
const state = ref<State>('loading')
const cashlink = ref<ParsedCashlink | null>(null)
const balance = ref(0)
const inNimiqPay = ref<boolean | null>(null)
const error = ref<string | null>(null)
let listenerHandle: number | null = null

const amount = computed(() => balance.value || cashlink.value?.value || 0)
const heading = computed(() => ({
  loading: 'Opening Cash Link…',
  invalid: 'This Cash Link is not valid',
  waiting: 'This Cash Link is almost ready',
  unclaimed: 'You received cash!',
  claiming: 'You received cash!',
  claimed: 'This Cash Link was already claimed',
  success: 'Cash received!',
})[state.value])

// A claim in flight or done must not be overwritten by a status refresh.
const isBusy = () => state.value === 'claiming' || state.value === 'success'

async function refresh() {
  if (!cashlink.value || isBusy()) return
  try {
    const result = await getCashlinkStatus(cashlink.value.address)
    if (isBusy()) return
    balance.value = result.balance
    state.value = result.status
  }
  catch (e) {
    error.value = errorMessage(e)
  }
}

onMounted(async () => {
  getProvider().then(() => (inNimiqPay.value = true), () => (inNimiqPay.value = false))
  cashlink.value = await parseCashlink(props.secret)
  if (!cashlink.value) {
    state.value = 'invalid'
    return
  }
  await refresh()
  // Update live when the deposit lands or someone else claims it.
  const client = await getReadyClient()
  listenerHandle = await client.addTransactionListener(() => refresh(), [cashlink.value.address])
})

onUnmounted(async () => {
  if (listenerHandle !== null) (await getReadyClient()).removeListener(listenerHandle)
})

async function claim() {
  error.value = null
  state.value = 'claiming'
  try {
    const recipient = await getPayoutAddress()
    await sweepCashlink(props.secret, recipient)
    state.value = 'success'
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
      <span class="badge"><Icon name="dollar" :size="34" /></span>
      <p class="heading">
        {{ heading }}
      </p>
      <template v-if="cashlink">
        <div class="amount">
          <span class="accent">{{ nimAmount(amount) }}</span><span class="unit">NIM</span>
        </div>
        <p v-if="rate" class="muted">
          ≈ {{ formatUsd(lunaToUsd(amount, rate)) }}
        </p>
        <p v-if="cashlink.message" class="message">
          “{{ cashlink.message }}”
        </p>
      </template>
      <p v-if="state === 'loading'" class="status muted">
        <span class="spinner" /> Connecting to the Nimiq network…
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
        <p class="hint muted">
          Open this link in <strong>Nimiq Pay</strong> (Mini Apps) to claim it, or use the Nimiq web wallet:
        </p>
        <a class="btn btn-primary" :href="hubClaimUrl(secret)">Claim with Nimiq Wallet</a>
      </template>
    </template>

    <button v-else-if="state !== 'loading' && state !== 'waiting'" class="btn btn-primary" @click="emit('done')">
      {{ state === 'success' ? 'Done' : 'Send your own Cash Link' }}
    </button>
  </main>
</template>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 72px;
  text-align: center;
}

.badge {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--accent);
}

.heading {
  margin: 20px 0 4px;
  font-size: 20px;
  font-weight: 600;
}

.amount {
  font-size: 52px;
  font-weight: 800;
}

.unit {
  color: #c0c2d6;
}

.hero p {
  margin-top: 6px;
}

.message {
  max-width: 320px;
  margin-top: 16px;
  font-size: 17px;
  font-style: italic;
}

.status {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 320px;
  margin-top: 24px;
}

.hint {
  margin: 0 0 14px;
  text-align: center;
}

.error {
  margin: 0 0 12px;
}
</style>
