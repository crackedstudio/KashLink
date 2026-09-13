<script setup lang="ts">
import { computed, ref } from 'vue'
import { type Currency, formatNim, formatUsd, lunaToUsd } from '../lib/format'
import { feeFor, formatUsdt } from '../lib/usdt'
import Icon from './Icon.vue'

const props = defineProps<{
  token: 'nim' | 'usdt'
  luna: number
  currency: Currency
  rate: number | null
  sending: boolean
  error: string | null
}>()
const emit = defineEmits<{ back: [], send: [] }>()

const showHelp = ref(false)
const isUsdt = computed(() => props.token === 'usdt')
/** `luna` carries the chosen token's smallest unit: luna for NIM, 6-decimal units for USDT. */
const amount = computed(() => (isUsdt.value ? `${formatUsdt(BigInt(props.luna))} USDT` : formatNim(props.luna)))
const usd = computed(() => (props.rate && !isUsdt.value ? formatUsd(lunaToUsd(props.luna, props.rate)) : null))
const primary = computed(() => {
  if (isUsdt.value) return `$${formatUsdt(BigInt(props.luna))}`
  return props.currency === 'USD' && usd.value ? usd.value : formatNim(props.luna)
})
const secondary = computed(() => {
  if (isUsdt.value) return amount.value
  return props.currency === 'USD' ? formatNim(props.luna) : usd.value && `≈ ${usd.value}`
})
const fee = computed(() => (isUsdt.value ? feeFor(BigInt(props.luna)) : 0n))
const feeText = computed(() => `${formatUsdt(fee.value)} USDT`)
const totalText = computed(() => (isUsdt.value
  ? `${formatUsdt(BigInt(props.luna) + fee.value)} USDT`
  : amount.value))
const feeNote = computed(() => (isUsdt.value
  ? 'Your friend receives the full amount. The fee covers sending it without you needing gas, and is not returned if you cancel the link.'
  : 'Nimiq transactions are free, so the total is exactly what your friend receives.'))
</script>

<template>
  <main class="screen">
    <button class="back" aria-label="Back" :disabled="sending" @click="emit('back')">
      <Icon name="back" />
    </button>
    <h1 class="title">
      Review
    </h1>

    <div class="summary">
      <span class="badge"><Icon name="link" :size="30" /></span>
      <p class="to muted">
        Sending to
      </p>
      <strong class="name">KashLink</strong>
      <div class="primary">
        {{ primary }}
      </div>
      <p v-if="secondary" class="muted secondary">
        {{ secondary }}
      </p>
    </div>

    <div class="card details">
      <div class="row">
        <span class="muted">Amount</span>
        <strong>{{ amount }}</strong>
      </div>
      <div class="row">
        <span class="muted">{{ isUsdt ? 'Service fee' : 'Network fee' }}</span>
        <strong :class="{ green: !isUsdt }">{{ isUsdt ? feeText : 'Free' }}</strong>
      </div>
      <div class="row total">
        <span>Total
          <button class="help-btn" aria-label="What is the total?" @click="showHelp = !showHelp">
            <Icon name="help" :size="18" />
          </button>
        </span>
        <strong>{{ totalText }}</strong>
      </div>
      <p v-if="showHelp" class="help muted">
        {{ feeNote }}
      </p>
    </div>

    <p v-if="error" class="error">
      {{ error }}
    </p>
    <button class="btn btn-primary" :disabled="sending" @click="emit('send')">
      <template v-if="sending">
        <span class="spinner" /> Confirm in Nimiq Pay…
      </template>
      <template v-else>
        Send {{ totalText }}
      </template>
    </button>
  </main>
</template>

<style scoped>
.summary {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 0;
  text-align: center;
}

.badge {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--nq-light-blue);
  background-image: var(--accent-bg);
  color: #fff;
  box-shadow: var(--shadow-btn);
}

.to {
  margin-top: 14px;
  font-size: 13px;
}

.name {
  font-size: 17px;
  font-weight: 700;
}

.primary {
  margin-top: 18px;
  font-size: 44px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.secondary {
  margin-top: 6px;
  font-size: 15px;
  font-weight: 600;
}

.details {
  margin-bottom: 14px;
  padding: 4px 16px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  font-size: 15px;
}

.row + .row {
  border-top: 1px solid var(--highlight);
}

.row strong {
  font-weight: 700;
}

.total {
  font-weight: 700;
}

.total > span {
  display: flex;
  align-items: center;
  gap: 2px;
}

.help-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  background: none;
  color: var(--muted-2);
}

.help {
  padding: 0 0 12px;
  font-size: 13px;
}

.error {
  margin: 0 0 12px;
}
</style>
