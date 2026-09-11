# KashLink

A Cash Link mini app for Nimiq Pay.

Send NIM to anyone with a link, like MiniPay's Cash Link.

**Flow:** How it works → Amount → Send to Cash Link → "Your Cash Link is ready" (share / copy / WhatsApp / revert).
Whoever opens the link inside Nimiq Pay taps **Claim cash** and the NIM moves to their wallet.

## How it works

1. The app generates a throwaway Nimiq key pair. Its private key goes into the link's `#fragment`
   (fragments are never sent to any server).
2. You fund that address from your wallet via `sendBasicTransactionWithData` (one Nimiq Pay approval).
3. The recipient's copy of the app signs a transaction with the link's key that sweeps the balance to
   their own address (`listAccounts`), and broadcasts it with the in-browser Nimiq light client.
   NIM transactions are free, so the link never needs gas.
4. **Revert** does the same sweep back to your address. Created links are kept in `localStorage` on your
   device (tap "Your Cash Links" on the first screen) so you can revert later.

Links use the same encoding as the Nimiq Hub, so someone without Nimiq Pay can also claim at
`hub.nimiq.com/cashlink/#…` (the claim screen offers this automatically in a normal browser).

## Develop

```bash
npm install
npm run dev          # http://<your-LAN-IP>:5190
```

Open **Nimiq Pay → Mini Apps**, enter the Network URL. Phone and computer must be on the same Wi-Fi.

Test with fake money first: in Nimiq Pay long-press **Settings** for 10 s → dev menu → **Testnet**, then
use **Get free NIM**. `npm run dev` connects the app to testnet; production builds use mainnet
(override with `VITE_NIMIQ_NETWORK`, see `.env.example`).

## Ship

```bash
npm run build        # static files in dist/
```

Host `dist/` on any HTTPS host (Vercel, Netlify, Cloudflare Pages) and set `VITE_PUBLIC_URL` to that URL
so shared links point at it. Links created from a LAN dev URL only open on your Wi-Fi.
