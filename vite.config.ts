import { nimiq } from '@nimiq/core/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), nimiq()],
  server: {
    // Reachable from Nimiq Pay on a phone in the same Wi-Fi network.
    host: true,
    // 5173 is taken by another project on this machine; fail instead of silently picking a random port.
    port: 5190,
    strictPort: true,
  },
})
