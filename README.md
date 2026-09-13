# KashLink

Send money as a link. No address, no account, no gas.

KashLink is a [Nimiq Pay](https://nimiq.com/nimiq-pay/) mini app that turns an amount into a shareable
link. Whoever opens it keeps the money. It carries **NIM** and **USDT on Polygon**, works inside Nimiq
Pay and in an ordinary browser, and never asks either side to hold a gas token.

Inspired by MiniPay's Cash Link, with three things the built-in Nimiq cashlink does not do: stablecoins,
links you can take back, and a view of what you have sent.

---

## How a link works

Every link is a throwaway wallet.

1. The app generates a fresh key pair and puts the **private key in the URL fragment** (`…/#<key>`).
   Fragments are never transmitted to a server, so the key stays between the people holding the link.
2. The sender funds that address from their wallet.
3. The recipient's copy of the app signs a transfer **with the link's own key** and broadcasts it.

The consequence worth understanding: **whoever holds the link controls the money.** There is no
account, no recovery, and no permission check — which is what makes it work for someone who has never
used crypto, and why a link should be shared like cash.

### The gas problem, and how each chain solves it

A brand-new address holds no gas, so moving money out of it should be impossible.

| | Solution |
| --- | --- |
| **NIM** | Nimiq transactions are free. Nothing to solve. |
| **USDT** | Polygon demands POL. The holder signs an EIP-712 **meta-transaction** off-chain and a relayer submits it, paying the gas. |

Polygon's USDT exposes `executeMetaTransaction`, which is what makes the second row possible. Its
EIP-712 domain is non-standard — the chain id lives in `salt` and there is no `chainId` field — and it
was verified against the contract's own `DOMAIN_SEPARATOR`. Changing any part of it silently
invalidates every signature.

---

## Features

**Two tokens.** NIM for speed and zero fees; USDT for an amount that still means something next week.

**Works in two places.** Inside Nimiq Pay the injected provider signs. In a browser the
[Nimiq Hub](https://hub.nimiq.com) signs NIM, and any injected EVM wallet signs USDT. Claiming needs no
wallet at all beyond an address to receive.

**Links that come back.** Unclaimed links are listed with their on-chain status, and anything older
than 7 days can be returned in one tap. This is *not* automatic: the key lives only on the sender's
device, so the money returns when they next open the app. Putting keys somewhere a timer could reach
them would mean custodying user funds.

**A sender's view.** "2 of 5 claimed · 300 NIM still out there", per-link status, and a Return button.

**Opens straight in the app.** Shared links are `nimpay.app/miniapps/open/…` URLs, a Universal Link and
App Link domain for Nimiq Pay, so tapping one in WhatsApp opens the app directly on the claim screen.

---

## Fees

USDT links carry a service fee; NIM links are free, because there is no gas to reimburse.

| | |
| --- | --- |
| Rate | **1%**, minimum **$0.10** |
| Charged to | the sender, **on top** — the recipient gets the round number |
| Taken when | the link is resolved, whether claimed **or** reverted |
| Cost to run | ~$0.008 of gas per link |

The fee is charged on a revert as well as a claim. Otherwise a cancelled link costs the relayer gas for
no revenue, and repeating create-then-revert would be a free way to drain it. The review screen and the
revert button both state this before the user commits.

Set `VITE_TREASURY_ADDRESS` to collect fees; leave it unset and USDT links are free.

> **Honest limitation.** The fee is avoidable. A recipient holding the link's key can import it into any
> wallet and sweep the USDT themselves. Making it unavoidable requires an escrow contract instead of a
> plain address.

---

## Project layout

```
src/
  lib/
    kashlink.ts     NIM links: encode, decode, sweep, status, share URLs
    usdt.ts         USDT links: encoding, EIP-712 meta-transactions, fee maths
    usdt-links.ts   USDT funding and claiming via the relayer
    wallet.ts       one interface over Nimiq Pay's provider and the Nimiq Hub
    nimiq.ts        Nimiq reads and broadcasts (RPC, light client fallback)
    links.ts        sender's links: status cache, expiry, bulk return
    storage.ts      localStorage — link keys live here and nowhere else
    analytics.ts    usage events (never touches the URL; see the note in the file)
  components/       one file per screen
supabase/
  functions/relay/  the gas relayer
  schema.sql        analytics table and its row-level security
  queries.sql       dashboard queries
```

NIM links use the Nimiq Hub's cashlink encoding, so they remain compatible with the wider Nimiq
ecosystem. USDT links use the same shape on a different curve and are served from `/u`, which lets the
claim screen pick a chain before it reads the key.

---

## Development

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run dev          # http://<your-LAN-IP>:5190
```

Open **Nimiq Pay → Mini Apps** and enter the Network URL printed in the terminal — not `localhost`,
which on a phone means the phone. Both devices must share a Wi-Fi network.

**Test NIM with fake money first.** In Nimiq Pay, long-press **Settings** for 10 seconds to reveal the
dev menu, switch to **Testnet**, then use **Get free NIM**. `npm run dev` targets testnet by default;
production builds target mainnet.

USDT has no testnet path here — the relayer and contract addresses are mainnet — so test it with an
amount you do not mind losing.

```bash
npm run build        # type-check and bundle to dist/
```

---

## Configuration

All client variables are `VITE_`-prefixed and **baked in at build time**, so changing one needs a
redeploy. See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `VITE_NIMIQ_NETWORK` | `MainAlbatross` / `TestAlbatross`. Must match Nimiq Pay's network. |
| `VITE_PUBLIC_URL` | Public URL that shared links point at. |
| `VITE_RELAY_URL` | Gas relayer endpoint. **Unset ⇒ USDT links are hidden.** |
| `VITE_TREASURY_ADDRESS` | Fee destination. Unset ⇒ USDT links are free. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Analytics. Unset ⇒ nothing is recorded. |
| `VITE_DIRECT_LINKS` | `false` shares the plain app URL instead of the nimpay.app one. |
| `VITE_NIMIQ_RPC_URL` / `VITE_POLYGON_RPC_URL` | Override the public RPCs. |

Server-side only, set with `supabase secrets set` — never as a `VITE_` variable, which would publish it
to every visitor:

| Secret | Purpose |
| --- | --- |
| `RELAYER_PRIVATE_KEY` | Signs and pays for relayed transactions. |
| `POLYGON_RPC_URL` | Optional dedicated RPC for the relayer. |

---

## Deployment

**Frontend** — any static host. The repo is set up for Vercel (`vercel.json` handles the `/u` route and
asset caching):

```bash
npm run build        # dist/
```

**Relayer** — a Supabase Edge Function:

```bash
supabase functions deploy relay --no-verify-jwt
supabase secrets set RELAYER_PRIVATE_KEY=0x...
```

Then fund the relayer address with POL. Roughly **$0.008 per link**, so $5 covers about 600.

**Analytics** — paste `supabase/schema.sql` into the Supabase SQL editor. It creates the table and a
row-level security policy that lets the public key *append* events and nothing else: it cannot read the
table, enumerate links, or erase history. Read your numbers with `supabase/queries.sql`.

---

## Security notes

- **Link keys never leave the device.** They live in the URL fragment and `localStorage`. No server ever
  receives one.
- **Analytics never reads `location`.** A link URL contains a spendable key, so anything logging page
  URLs would ship keys to a third party. Every value sent is passed explicitly; see `src/lib/analytics.ts`.
- **The relayer is a hot wallet.** Keep only a working balance in it — that balance is the maximum
  anyone can burn. It relays exactly one call shape (a USDT transfer above a floor), checks the sender's
  balance, and simulates every request, refusing anything that would revert.
- **Payouts never go to contracts.** A transfer into an HTLC or vesting contract is accepted by the
  network and then fails, stranding the funds. Claims and reverts resolve to a basic address only.
- **Clearing site data loses unclaimed links.** The key is the money.

---

## Licence

MIT
