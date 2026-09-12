<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { track } from '../lib/analytics'
import { getKashlinkStatus, shareUrl, sweepKashlink } from '../lib/kashlink'
import { formatDate, formatNim, formatUsd, lunaToUsd, nimAmount } from '../lib/format'
import { errorMessage } from '../lib/provider'
import { getPayoutAddress } from '../lib/wallet'
import type { StoredLink } from '../lib/storage'
import Icon from './Icon.vue'

const props = defineProps<{ link: StoredLink, rate: number | null }>()
const emit = defineEmits<{ close: [] }>()

const url = computed(() => shareUrl(props.link.secret))
const shareText = computed(() => `I sent you ${formatNim(props.link.value)} with a Nimiq KashLink. Open it in Nimiq Pay to claim:`)
const whatsappUrl = computed(() => `https://wa.me/?text=${encodeURIComponent(`${shareText.value} ${url.value}`)}`)

const copied = ref(false)
const confirmRevert = ref(false)
const reverting = ref(false)
const reverted = ref(false)
/** Funds already moved out (claimed, or reverted earlier) — read from the chain, not stored locally. */
const claimed = ref(false)
const error = ref<string | null>(null)

onMounted(() => {
  getKashlinkStatus(props.link.address)
    .then(({ status }) => (claimed.value = status === 'claimed'))
    .catch(() => {})
})

async function copy() {
  try {
    await navigator.clipboard.writeText(url.value)
  }
  catch {
    // Clipboard API is unavailable on plain-HTTP LAN dev URLs
    const el = document.createElement('textarea')
    el.value = url.value
    document.body.append(el)
    el.select()
    document.execCommand('copy')
    el.remove()
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

async function share() {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'KashLink', text: shareText.value, url: url.value })
    }
    catch {
      // user closed the share sheet
    }
    return
  }
  await copy()
}

async function revert() {
  if (!confirmRevert.value) {
    confirmRevert.value = true
    return
  }
  reverting.value = true
  error.value = null
  try {
    await sweepKashlink(props.link.secret, await getPayoutAddress())
    reverted.value = true
    track('reverted', props.link.value, props.link.address)
  }
  catch (e) {
    error.value = errorMessage(e)
  }
  finally {
    reverting.value = false
    confirmRevert.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-label="Your KashLink">
      <div class="handle" />

      <span class="badge" :class="{ done: reverted || claimed }">
        <Icon :name="reverted || claimed ? 'check' : 'link'" :size="26" />
      </span>
      <p class="heading">
        {{ reverted ? 'KashLink reverted' : claimed ? 'KashLink claimed' : 'Your KashLink is ready!' }}
      </p>
      <div class="amount">
        <span>{{ nimAmount(link.value) }}</span><span class="unit">NIM</span>
      </div>
      <p v-if="rate" class="fiat muted">
        ≈ {{ formatUsd(lunaToUsd(link.value, rate)) }}
      </p>
      <p class="date muted">
        {{ formatDate(link.createdAt) }}
      </p>

      <template v-if="!reverted && !claimed">
        <p class="label">
          Share your KashLink
        </p>
        <div class="url-row">
          <span class="url">{{ url }}</span>
          <a class="icon-btn whatsapp" :href="whatsappUrl" target="_blank" rel="noopener" aria-label="Share on WhatsApp">
            <Icon name="whatsapp" :size="22" />
          </a>
          <button class="icon-btn" :class="{ copied }" aria-label="Copy link" @click="copy">
            <Icon :name="copied ? 'check' : 'copy'" :size="22" />
          </button>
        </div>

        <p class="warning muted">
          <Icon name="alert" :size="18" /> Anyone with this link can claim the cash.
        </p>

        <p v-if="error" class="error">
          {{ error }}
        </p>
        <button class="btn btn-primary" @click="share">
          <Icon name="share" :size="20" /> Share link
        </button>
        <button class="btn btn-outline" :disabled="reverting" @click="revert">
          <template v-if="reverting">
            <span class="spinner" /> Reverting…
          </template>
          <template v-else>
            {{ confirmRevert ? 'Tap again to revert' : 'Revert link' }}
          </template>
        </button>
      </template>

      <template v-else>
        <p class="warning muted center">
          {{ reverted ? 'The NIM is on its way back to your wallet.' : 'The NIM was already taken out of this link.' }} This link no longer works.
        </p>
        <button class="btn btn-primary" @click="emit('close')">
          Done
        </button>
      </template>
    </section>
  </div>
</template>

<style scoped>
.badge {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin: 4px auto 0;
  border-radius: 50%;
  background: var(--nq-light-blue);
  background-image: var(--accent-bg);
  color: #fff;
  box-shadow: var(--shadow-btn);
}

.badge.done {
  background: var(--nq-green);
  background-image: var(--green-bg);
  box-shadow: 0 6px 16px rgba(33, 188, 165, 0.35);
}

.heading {
  margin-top: 14px;
  font-size: 17px;
  font-weight: 800;
  text-align: center;
}

.amount {
  margin-top: 6px;
  font-size: 40px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-align: center;
}

.unit {
  margin-left: 6px;
  color: var(--muted-2);
  font-size: 20px;
  font-weight: 700;
}

.fiat {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
}

.date {
  margin: 4px 0 20px;
  font-size: 13px;
  text-align: center;
}

.label {
  margin-bottom: 8px;
}

.url-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-left: 14px;
  border-radius: 500px;
  background: var(--highlight);
}

.url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.icon-btn {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 48px;
  border: 0;
  background: none;
  color: var(--text);
  transition: color 0.2s var(--ease);
}

.icon-btn.whatsapp {
  color: #25d366;
}

.icon-btn.copied {
  color: var(--nq-green);
}

.warning {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 2px 18px;
  font-size: 13px;
  font-weight: 600;
}

.warning.center {
  justify-content: center;
  text-align: center;
}

.error {
  margin: 0 0 12px;
}
</style>
