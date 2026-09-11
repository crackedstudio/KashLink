<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{ linkCount: number }>()
const emit = defineEmits<{ next: [], showLinks: [] }>()

const steps = [
  { title: 'Deposit to the Cash Link', text: 'From your wallet' },
  { title: 'Share the link', text: 'Anyone with the link can claim the cash' },
  { title: 'Cash is received by your friend', text: 'When they open it in Nimiq Pay' },
]
</script>

<template>
  <main class="screen">
    <h1 class="title intro-title">
      Send with Cash Link
    </h1>

    <svg class="hero" viewBox="0 0 440 180" role="img" aria-label="A safe and a phone showing a banknote">
      <rect width="440" height="180" rx="14" fill="#6aa6a0" />
      <path d="M110 0h190c10 40-10 80-60 90S110 60 110 0z" fill="#7cb5af" />
      <ellipse cx="150" cy="140" rx="60" ry="5" fill="#4d7f7a" />
      <rect x="96" y="56" width="100" height="82" rx="8" fill="#4b4660" />
      <rect x="170" y="56" width="26" height="82" rx="6" fill="#39354b" />
      <rect x="104" y="136" width="10" height="8" rx="2" fill="#39354b" />
      <rect x="176" y="136" width="10" height="8" rx="2" fill="#39354b" />
      <text x="116" y="112" font-size="34" font-weight="800" fill="#eceaf3">$</text>
      <circle cx="152" cy="97" r="13" fill="none" stroke="#eceaf3" stroke-width="4" />
      <circle cx="152" cy="97" r="4" fill="#eceaf3" />
      <g transform="rotate(-4 360 130)">
        <rect x="300" y="52" width="120" height="160" rx="16" fill="#433e56" />
        <rect x="310" y="62" width="100" height="140" rx="8" fill="#fbe7b5" />
        <rect x="326" y="72" width="68" height="120" rx="4" fill="#2cb67d" />
        <rect x="334" y="80" width="52" height="104" rx="3" fill="none" stroke="#1e8f60" stroke-width="3" />
        <circle cx="360" cy="132" r="14" fill="#1e8f60" />
      </g>
      <path d="M404 180l36-36v24a12 12 0 0 1-12 12z" fill="#fff" />
    </svg>

    <p class="how accent">
      <Icon name="info" :size="22" /> How it works
    </p>

    <ol class="steps">
      <li v-for="(step, i) in steps" :key="i">
        <span class="num">{{ i + 1 }}</span>
        <div>
          <strong>{{ step.title }}</strong>
          <span class="muted">{{ step.text }}</span>
        </div>
      </li>
    </ol>

    <div class="spacer" />

    <button v-if="linkCount" class="link-btn" @click="emit('showLinks')">
      Your Cash Links ({{ linkCount }})
    </button>
    <button class="btn btn-primary" @click="emit('next')">
      Next
    </button>
  </main>
</template>

<style scoped>
.intro-title {
  margin-top: 48px;
}

.hero {
  display: block;
  width: 100%;
  height: auto;
  margin-top: 28px;
}

.how {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 18px 0 8px;
  font-size: 17px;
  font-weight: 600;
}

.steps {
  margin: 0;
  padding: 0;
  list-style: none;
}

.steps li {
  position: relative;
  display: flex;
  gap: 18px;
  padding: 10px 0;
}

.steps li:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 50px;
  left: 23px;
  width: 2px;
  height: calc(100% - 40px);
  background: var(--accent-dark);
}

.num {
  display: grid;
  flex: none;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent-dark);
  font-weight: 700;
}

.steps div {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}

.steps strong {
  font-size: 17px;
}

.steps .muted {
  font-size: 15px;
}
</style>
