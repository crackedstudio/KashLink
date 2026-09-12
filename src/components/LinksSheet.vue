<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { formatDate, formatNim } from '../lib/format'
import { formatUsdt } from '../lib/usdt'
import { EXPIRY_DAYS, isExpired, refreshStatuses, revertLinks, statuses } from '../lib/links'
import { errorMessage } from '../lib/provider'
import type { StoredLink } from '../lib/storage'
import Icon from './Icon.vue'

const props = defineProps<{ links: StoredLink[] }>()
const emit = defineEmits<{ open: [link: StoredLink], close: [], changed: [] }>()

const labels = { pending: 'Pending', unclaimed: 'Unclaimed', claimed: 'Claimed', reverted: 'Returned' } as const

/** NIM and USDT cannot be added together, so totals are listed per token. */
function amountOf(link: StoredLink): string {
  return link.token === 'usdt' ? `${formatUsdt(BigInt(link.value))} USDT` : formatNim(link.value)
}
function totalOf(list: StoredLink[]): string {
  const nim = list.filter(l => l.token !== 'usdt').reduce((sum, l) => sum + l.value, 0)
  const usdt = list.filter(l => l.token === 'usdt').reduce((sum, l) => sum + BigInt(l.value), 0n)
  return [nim ? formatNim(nim) : '', usdt ? `${formatUsdt(usdt)} USDT` : ''].filter(Boolean).join(' + ')
}

const loading = ref(true)
const reverting = ref<string | null>(null)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

onMounted(async () => {
  await refreshStatuses(props.links)
  loading.value = false
})

const claimed = computed(() => props.links.filter(l => statuses[l.address] === 'claimed').length)
const outstanding = computed(() => props.links.filter(l => statuses[l.address] === 'unclaimed'))
const outstandingTotal = computed(() => totalOf(outstanding.value))
const expired = computed(() => props.links.filter(isExpired))
const expiredTotal = computed(() => totalOf(expired.value))

async function revert(links: StoredLink[], key: string) {
  reverting.value = key
  error.value = null
  notice.value = null
  try {
    const { reverted, failed, links: returned } = await revertLinks(links)
    if (reverted) notice.value = `Returned ${totalOf(returned)} to your wallet.`
    if (failed) error.value = `${failed} link${failed > 1 ? 's' : ''} could not be returned. Try again in a moment.`
    emit('changed')
  }
  catch (e) {
    error.value = errorMessage(e)
  }
  finally {
    reverting.value = null
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-label="Your KashLinks">
      <div class="handle" />
      <h2>Your KashLinks</h2>
      <p class="summary muted">
        <template v-if="loading">
          Checking {{ links.length }} link{{ links.length > 1 ? 's' : '' }}…
        </template>
        <template v-else>
          {{ claimed }} of {{ links.length }} claimed
          <template v-if="outstandingTotal"> · <strong>{{ outstandingTotal }}</strong> still out there</template>
        </template>
      </p>

      <div v-if="expired.length" class="expired">
        <div>
          <strong>{{ expired.length }} link{{ expired.length > 1 ? 's' : '' }} unclaimed after {{ EXPIRY_DAYS }} days</strong>
          <span class="muted">Nobody opened them. You can take the money back.</span>
        </div>
        <button class="btn btn-primary small" :disabled="!!reverting" @click="revert(expired, 'all')">
          <template v-if="reverting === 'all'">
            <span class="spinner" /> Returning…
          </template>
          <template v-else>
            Return {{ expiredTotal }}
          </template>
        </button>
      </div>

      <p v-if="notice" class="notice">
        {{ notice }}
      </p>
      <p v-if="error" class="error">
        {{ error }}
      </p>

      <ul>
        <li v-for="link in links" :key="link.address">
          <button class="row" @click="emit('open', link)">
            <span class="info">
              <strong>{{ amountOf(link) }}</strong>
              <span class="muted">{{ formatDate(link.createdAt) }}</span>
            </span>
            <span class="status" :class="statuses[link.address]">
              {{ statuses[link.address] ? labels[statuses[link.address]] : '—' }}
            </span>
          </button>
          <button
            v-if="statuses[link.address] === 'unclaimed'" class="return-btn" :disabled="!!reverting"
            @click="revert([link], link.address)"
          >
            <span v-if="reverting === link.address" class="spinner" />
            <template v-else>
              <Icon name="back" :size="16" /> Return
            </template>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
h2 {
  margin: 0 0 2px;
  font-size: 20px;
  font-weight: 800;
}

.summary {
  margin: 0 0 14px;
  font-size: 13px;
}

.summary strong {
  color: var(--text);
}

.expired {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--highlight);
}

.expired div {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.expired strong {
  font-size: 14px;
}

.expired .muted {
  font-size: 12px;
}

.btn.small {
  width: auto;
  min-height: 40px;
  padding: 0 14px;
  font-size: 14px;
  white-space: nowrap;
}

.notice {
  margin: 0 0 12px;
  color: var(--nq-green);
  font-size: 14px;
  font-weight: 600;
}

.error {
  margin: 0 0 12px;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--highlight);
}

li:last-child {
  border-bottom: 0;
}

.row {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  min-height: 60px;
  padding: 8px 0;
  border: 0;
  background: none;
  color: var(--text);
  text-align: left;
}

.info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info strong {
  font-size: 16px;
  font-weight: 700;
}

.muted {
  font-size: 13px;
}

.status {
  padding: 4px 10px;
  border-radius: 500px;
  background: var(--highlight);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.status.unclaimed {
  background: rgba(33, 188, 165, 0.12);
  color: var(--nq-green);
}

.return-btn {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
  min-height: 44px;
  padding: 0 10px;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.return-btn:disabled {
  opacity: 0.4;
}
</style>
