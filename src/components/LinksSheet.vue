<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { getCashlinkStatus } from '../lib/cashlink'
import { formatDate, formatNim } from '../lib/format'
import type { StoredLink } from '../lib/storage'

const props = defineProps<{ links: StoredLink[] }>()
const emit = defineEmits<{ open: [link: StoredLink], close: [] }>()

const labels = { unclaimed: 'Unclaimed', claimed: 'Claimed', waiting: 'Pending' } as const
const statuses = reactive<Record<string, string>>({})

onMounted(() => {
  for (const link of props.links) {
    getCashlinkStatus(link.address)
      .then(({ status }) => (statuses[link.address] = labels[status]))
      .catch(() => (statuses[link.address] = ''))
  }
})
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-label="Your Cash Links">
      <div class="handle" />
      <h2>Your Cash Links</h2>
      <ul>
        <li v-for="link in links" :key="link.address">
          <button @click="emit('open', link)">
            <span>
              <strong>{{ formatNim(link.value) }}</strong>
              <span class="muted">{{ formatDate(link.createdAt) }}</span>
            </span>
            <span class="status" :class="{ open: statuses[link.address] === 'Unclaimed' }">
              {{ statuses[link.address] ?? '…' }}
            </span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

li button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 64px;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: none;
  text-align: left;
}

li button > span:first-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.muted {
  font-size: 14px;
}

.status {
  color: var(--muted);
  font-size: 14px;
}

.status.open {
  color: var(--accent);
}
</style>
