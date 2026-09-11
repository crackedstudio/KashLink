<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{ linkCount: number }>()
const emit = defineEmits<{ next: [], showLinks: [] }>()

const steps = [
  { title: 'Deposit to the Cash Link', text: 'From your Nimiq Pay wallet' },
  { title: 'Share the link', text: 'Anyone with the link can claim the cash' },
  { title: 'Your friend receives the NIM', text: 'When they open it in Nimiq Pay' },
]
</script>

<template>
  <main class="screen">
    <h1 class="title intro-title">
      Send with Cash Link
    </h1>
    <p class="subtitle muted">
      Send NIM to anyone with a link, no address needed.
    </p>

    <svg class="hero" viewBox="0 0 335 168" role="img" aria-label="A phone sending a Nimiq coin through a link">
      <defs>
        <radialGradient id="hero-bg" cx="100%" cy="100%" r="120%">
          <stop offset="0" stop-color="#265DD7" />
          <stop offset="1" stop-color="#0582CA" />
        </radialGradient>
        <radialGradient id="hero-gold" cx="100%" cy="100%" r="100%">
          <stop offset="0" stop-color="#EC991C" />
          <stop offset="1" stop-color="#E9B213" />
        </radialGradient>
        <radialGradient id="hero-green" cx="100%" cy="100%" r="100%">
          <stop offset="0" stop-color="#41A38E" />
          <stop offset="1" stop-color="#21BCA5" />
        </radialGradient>
      </defs>
      <rect width="335" height="168" rx="20" fill="url(#hero-bg)" />
      <!-- soft decorative hexagons -->
      <path d="M298 18l16 9v18l-16 9-16-9V27z" fill="#fff" opacity=".08" />
      <path d="M40 120l12 7v14l-12 7-12-7v-14z" fill="#fff" opacity=".08" />
      <path d="M70 -6l20 11v22L70 38 50 27V5z" fill="#fff" opacity=".06" />
      <!-- sender phone -->
      <rect x="44" y="34" width="70" height="120" rx="12" fill="#fff" opacity=".18" />
      <rect x="49" y="39" width="60" height="110" rx="9" fill="#fff" />
      <rect x="69" y="45" width="20" height="4" rx="2" fill="#1F2348" opacity=".2" />
      <rect x="58" y="64" width="42" height="7" rx="3.5" fill="#1F2348" opacity=".12" />
      <rect x="58" y="78" width="28" height="7" rx="3.5" fill="#1F2348" opacity=".12" />
      <rect x="58" y="126" width="42" height="14" rx="7" fill="url(#hero-bg)" />
      <!-- link dashes -->
      <path d="M118 94 H 215" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 10" opacity=".85" />
      <!-- NIM coin travelling -->
      <g transform="translate(167 94)">
        <circle r="30" fill="#fff" opacity=".15" />
        <path d="M0-23l19.9 11.5v23L0 23l-19.9-11.5v-23z" fill="url(#hero-gold)" />
        <path d="M0-14l12.1 7v14L0 14l-12.1-7v-14z" fill="none" stroke="#fff" stroke-width="3" opacity=".9" />
      </g>
      <!-- receiver phone -->
      <rect x="221" y="34" width="70" height="120" rx="12" fill="#fff" opacity=".18" />
      <rect x="226" y="39" width="60" height="110" rx="9" fill="#fff" />
      <rect x="246" y="45" width="20" height="4" rx="2" fill="#1F2348" opacity=".2" />
      <circle cx="256" cy="86" r="17" fill="url(#hero-green)" />
      <path d="M248 86l5.5 5.5L265 80" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
      <rect x="240" y="112" width="32" height="6" rx="3" fill="#1F2348" opacity=".12" />
      <rect x="245" y="124" width="22" height="6" rx="3" fill="#1F2348" opacity=".08" />
    </svg>

    <p class="how label">
      How it works
    </p>

    <ol class="steps card">
      <li v-for="(step, i) in steps" :key="i">
        <span class="num">{{ i + 1 }}</span>
        <div>
          <strong>{{ step.title }}</strong>
          <span class="muted">{{ step.text }}</span>
        </div>
      </li>
    </ol>

    <div class="spacer" />

    <button v-if="linkCount" class="link-btn links" @click="emit('showLinks')">
      <Icon name="link" :size="18" /> Your Cash Links ({{ linkCount }})
    </button>
    <button class="btn btn-primary" @click="emit('next')">
      Create Cash Link
    </button>
  </main>
</template>

<style scoped>
.intro-title {
  margin-top: 24px;
}

.subtitle {
  margin-top: 6px;
  font-size: 15px;
}

.hero {
  display: block;
  width: 100%;
  height: auto;
  margin-top: 20px;
  filter: drop-shadow(0 8px 20px rgba(5, 130, 202, 0.25));
}

.how {
  margin: 22px 0 10px;
}

.steps {
  margin: 0;
  padding: 4px 16px;
  list-style: none;
}

.steps li {
  position: relative;
  display: flex;
  gap: 14px;
  padding: 12px 0;
}

.steps li:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 46px;
  left: 15px;
  width: 2px;
  height: calc(100% - 36px);
  border-radius: 1px;
  background: var(--accent-soft);
}

.num {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 14px;
  font-weight: 800;
}

.steps div {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.steps strong {
  font-size: 15px;
  font-weight: 700;
}

.steps .muted {
  font-size: 13px;
}

.links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 4px;
}
</style>
