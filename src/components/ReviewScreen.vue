<script setup lang="ts">
import { computed, ref } from 'vue'
import { type Currency, formatNim, formatUsd, lunaToUsd } from '../lib/format'
import Icon from './Icon.vue'

const props = defineProps<{
  luna: number
  currency: Currency
  rate: number | null
  sending: boolean
  error: string | null
}>()
const emit = defineEmits<{ back: [], send: [] }>()

const showHelp = ref(false)
const usd = computed(() => (props.rate ? formatUsd(lunaToUsd(props.luna, props.rate)) : null))
const primary = computed(() => (props.currency === 'USD' && usd.value ? usd.value : formatNim(props.luna)))
const secondary = computed(() => (props.currency === 'USD' ? formatNim(props.luna) : usd.value && `≈ ${usd.value}`))
</script>

<template>
  <main class="screen">
    <button class="back" aria-label="Back" :disabled="sending" @click="emit('back')">
      <Icon name="back" />
    </button>
    <h1 class="title">
      Send to
    </h1>

    <div class="recipient">
      <span class="badge"><Icon name="dollar" :size="26" /></span>
      <strong>Cash Link</strong>
    </div>

    <div class="summary">
      <div class="primary">
        {{ primary }}
      </div>
      <p v-if="secondary" class="muted">
        {{ secondary }}
      </p>
    </div>

    <p v-if="showHelp" class="help muted">
      Nimiq transactions are free, so the total is exactly what your friend receives.
    </p>
    <div class="total">
      <span>Total amount
        <button class="help-btn accent" aria-label="What is the total?" @click="showHelp = !showHelp">
          <Icon name="help" :size="22" />
        </button>
      </span>
      <strong>{{ formatNim(luna) }}</strong>
    </div>

    <p v-if="error" class="error">
      {{ error }}
    </p>
    <button class="btn btn-primary" :disabled="sending" @click="emit('send')">
      <template v-if="sending">
        <span class="spinner" /> Confirm in Nimiq Pay…
      </template>
      <template v-else>
        Send
      </template>
    </button>
  </main>
</template>

<style scoped>
.recipient {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 28px;
  font-size: 17px;
}

.badge {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent);
}

.summary {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.primary {
  font-size: 52px;
  font-weight: 700;
}

.summary p {
  margin: 6px 0 0;
}

.help {
  margin: 0 0 12px;
  font-size: 14px;
}

.total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  font-size: 16px;
}

.total span {
  display: flex;
  align-items: center;
}

.help-btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
}

.error {
  margin: 0 0 12px;
}
</style>
