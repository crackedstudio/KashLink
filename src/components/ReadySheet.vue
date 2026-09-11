<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getCashlinkStatus, linkUrl, sweepCashlink } from '../lib/cashlink'
import { formatDate, formatNim, formatUsd, lunaToUsd, nimAmount } from '../lib/format'
import { errorMessage, getPayoutAddress } from '../lib/provider'
import type { StoredLink } from '../lib/storage'
import Icon from './Icon.vue'

const props = defineProps<{ link: StoredLink, rate: number | null }>()
const emit = defineEmits<{ close: [] }>()

const url = computed(() => linkUrl(props.link.secret))
const shareText = computed(() => `I sent you ${formatNim(props.link.value)} with a Nimiq Cash Link. Open it in Nimiq Pay to claim:`)
const whatsappUrl = computed(() => `https://wa.me/?text=${encodeURIComponent(`${shareText.value} ${url.value}`)}`)

const copied = ref(false)
const confirmRevert = ref(false)
const reverting = ref(false)
const reverted = ref(false)
/** Funds already moved out (claimed, or reverted earlier) — read from the chain, not stored locally. */
const claimed = ref(false)
const error = ref<string | null>(null)

onMounted(() => {
  getCashlinkStatus(props.link.address)
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
      await navigator.share({ title: 'Cash Link', text: shareText.value, url: url.value })
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
    await sweepCashlink(props.link.secret, await getPayoutAddress())
    reverted.value = true
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
    <section class="sheet" role="dialog" aria-label="Your Cash Link">
      <div class="handle" />

      <p class="heading">
        {{ reverted ? 'Cash Link reverted' : claimed ? 'Cash Link claimed' : 'Your Cash Link is ready!' }}
      </p>
      <div class="amount">
        <span class="accent">{{ nimAmount(link.value) }}</span><span class="unit">NIM</span>
      </div>
      <p v-if="rate" class="fiat">
        ≈ {{ formatUsd(lunaToUsd(link.value, rate)) }}
      </p>
      <p class="date muted">
        {{ formatDate(link.createdAt) }}
      </p>

      <template v-if="!reverted && !claimed">
        <div class="share-box">
          <strong>Share your cash link</strong>
          <div class="url-row">
            <span class="url">{{ url }}</span>
            <a class="icon-btn accent" :href="whatsappUrl" target="_blank" rel="noopener" aria-label="Share on WhatsApp">
              <Icon name="whatsapp" />
            </a>
            <button class="icon-btn" aria-label="Copy link" @click="copy">
              <Icon :name="copied ? 'check' : 'copy'" />
            </button>
          </div>
        </div>

        <p class="warning">
          <Icon name="alert" :size="22" class="muted" /> Anyone with this link can claim the cash.
        </p>

        <p v-if="error" class="error">
          {{ error }}
        </p>
        <button class="btn btn-outline" :disabled="reverting" @click="revert">
          <template v-if="reverting">
            <span class="spinner" /> Reverting…
          </template>
          <template v-else>
            {{ confirmRevert ? 'Tap again to revert' : 'Revert link' }}
          </template>
        </button>
        <button class="btn btn-primary" @click="share">
          Share link
        </button>
      </template>

      <template v-else>
        <p class="warning muted">
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
.heading {
  margin: 0;
  font-size: 17px;
  text-align: center;
}

.amount {
  margin-top: 6px;
  font-size: 44px;
  font-weight: 800;
  text-align: center;
}

.unit {
  color: #c0c2d6;
}

.fiat {
  margin: 4px 0 0;
  font-size: 17px;
  text-align: center;
}

.date {
  margin: 6px 0 20px;
  font-size: 15px;
  text-align: center;
}

.share-box {
  padding: 14px 16px 16px;
  border-radius: var(--radius);
  background: var(--surface);
}

.share-box strong {
  font-size: 15px;
}

.url-row {
  display: flex;
  align-items: center;
  margin-top: 10px;
  padding-left: 18px;
  border-radius: 999px;
  background: var(--bg);
}

.url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.icon-btn {
  display: grid;
  flex: none;
  place-items: center;
  width: 48px;
  height: 52px;
  border: 0;
  background: none;
}

.warning {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 4px;
  font-size: 16px;
}

.error {
  margin: 0 0 12px;
}
</style>
