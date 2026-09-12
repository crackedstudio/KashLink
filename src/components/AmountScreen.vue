<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { type Currency, formatNim, formatUsd, LUNA_PER_NIM, lunaToUsd } from '../lib/format'
import Icon from './Icon.vue'

const props = defineProps<{
  /** Luna, null while loading. */
  balance: number | null
  balanceError: string | null
  /** False in a normal browser: no account is chosen yet, so the Hub shows and enforces the balance. */
  balanceKnown: boolean
  rate: number | null
}>()
const emit = defineEmits<{ back: [], retry: [], continue: [luna: number, currency: Currency] }>()

const currency = ref<Currency>(props.rate ? 'USD' : 'NIM')
const input = ref('0')
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']

// The price can arrive after this screen opened; default to USD like MiniPay if nothing was typed yet.
watch(() => props.rate, (rate) => {
  if (rate && input.value === '0') currency.value = 'USD'
})

const luna = computed(() => {
  const n = Number(input.value)
  if (!n) return 0
  if (currency.value === 'NIM') return Math.round(n * LUNA_PER_NIM)
  return props.rate ? Math.round((n / props.rate) * LUNA_PER_NIM) : 0
})

const secondary = computed(() => {
  if (currency.value === 'USD') return `≈ ${formatNim(luna.value)}`
  return props.rate ? `≈ ${formatUsd(lunaToUsd(luna.value, props.rate))}` : ''
})

const balanceText = computed(() => {
  if (props.balance === null) return 'Loading…'
  if (currency.value === 'USD' && props.rate) return formatUsd(lunaToUsd(props.balance, props.rate))
  return formatNim(props.balance)
})

const tooMuch = computed(() => props.balanceKnown && props.balance !== null && luna.value > props.balance)
const canContinue = computed(() =>
  luna.value > 0 && !tooMuch.value && (!props.balanceKnown || props.balance !== null))

function press(key: string) {
  let value = input.value
  if (key === 'del') {
    value = value.length > 1 ? value.slice(0, -1) : '0'
  }
  else if (key === '.') {
    if (!value.includes('.')) value += '.'
  }
  else {
    const decimals = value.split('.')[1]
    if (decimals !== undefined && decimals.length >= (currency.value === 'USD' ? 2 : 5)) return
    if (value.replace('.', '').length >= 12) return
    value = value === '0' ? key : value + key
  }
  input.value = value
}

function toggleCurrency() {
  if (!props.rate) return
  const current = luna.value
  currency.value = currency.value === 'USD' ? 'NIM' : 'USD'
  if (!current) return
  input.value = currency.value === 'NIM'
    ? String(Number((current / LUNA_PER_NIM).toFixed(5)))
    : String(Number(lunaToUsd(current, props.rate).toFixed(2)))
}
</script>

<template>
  <main class="screen">
    <button class="back" aria-label="Back" @click="emit('back')">
      <Icon name="back" />
    </button>
    <h1 class="title">
      Amount
    </h1>
    <p v-if="!balanceKnown" class="balance muted">
      Your Nimiq wallet will open to confirm.
    </p>
    <p v-else-if="balanceError" class="balance error left">
      {{ balanceError }}
      <button class="link-btn" @click="emit('retry')">
        Retry
      </button>
    </p>
    <p v-else class="balance muted">
      Available: <strong>{{ balanceText }}</strong>
    </p>
    <div class="display">
      <div class="amount">
        <span v-if="currency === 'USD'" class="unit">$</span>{{ input }}<span class="caret" /><span v-if="currency === 'NIM'" class="unit nim">NIM</span>
      </div>
      <button class="currency" :disabled="!rate" @click="toggleCurrency">
        <Icon v-if="currency === 'NIM'" name="hexagon" :size="14" class="gold" />
        {{ currency }} <Icon v-if="rate" name="chevron" :size="16" />
      </button>
      <p class="secondary muted">
        {{ tooMuch ? '' : secondary }}
      </p>
      <p v-if="tooMuch" class="error">
        Not enough NIM in your wallet
      </p>
    </div>

    <div class="keypad">
      <button v-for="key in keys" :key="key" :aria-label="key === 'del' ? 'Delete' : key" @click="press(key)">
        <Icon v-if="key === 'del'" name="backspace" />
        <template v-else>
          {{ key }}
        </template>
      </button>
    </div>

    <button class="btn btn-primary" :disabled="!canContinue" @click="emit('continue', luna, currency)">
      Continue
    </button>
  </main>
</template>

<style scoped>
.balance {
  margin: 4px 0 0;
  font-size: 14px;
}

.balance strong {
  color: var(--text);
  font-weight: 700;
}

.left {
  text-align: left;
}

.display {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 150px;
}

.amount {
  display: flex;
  align-items: center;
  max-width: 100%;
  font-size: 56px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  word-break: break-all;
}

.unit {
  color: var(--muted-2);
}

.unit.nim {
  margin-left: 8px;
  font-size: 26px;
  font-weight: 700;
}

.caret {
  width: 2px;
  height: 52px;
  margin-left: 3px;
  border-radius: 1px;
  background: var(--accent);
  animation: blink 1s steps(1) infinite;
}

.currency {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  margin-top: 14px;
  padding: 0 14px;
  border: 0;
  border-radius: 500px;
  background: var(--highlight);
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
  transition: background 0.2s var(--ease);
}

.currency:active:not(:disabled) {
  background: var(--highlight-strong);
}

.currency:disabled {
  cursor: default;
}

.gold {
  color: var(--nq-gold);
}

.secondary {
  min-height: 20px;
  margin: 10px 0 0;
  font-size: 15px;
  font-weight: 600;
}

.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-bottom: 12px;
}

.keypad button {
  display: grid;
  place-items: center;
  height: 56px;
  border: 0;
  border-radius: var(--radius);
  background: none;
  color: var(--text);
  font-size: 24px;
  font-weight: 700;
  transition: background 0.15s var(--ease);
}

.keypad button:active {
  background: var(--highlight);
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
