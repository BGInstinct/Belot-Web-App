# Belot

Real-time multiplayer Belot with a retro pixel-art look, a physical-game score tracker, Bulgarian/English UI and a cosmetics shop.

## Quick start

```bash
npm install
npm run assets   # rebuild public/assets from the source sprite sheets (already generated)
npm run dev      # server on :3001 + client on :5173
```

Open http://localhost:5173. Without any env vars the app runs in guest-only mode with the shop in read-only mode.

Other scripts: `npm test`, `npm run typecheck`, `npm run build`.

## Layout

| Path | What |
| --- | --- |
| `packages/engine` | Pure game engine (rules, bidding, announcements, scoring, bots) + shared types (`src/types.ts`) and the Socket.io protocol (`src/protocol.ts`) |
| `packages/server` | Express + Socket.io: rooms, 6-char codes, turn timers, bots, reconnection; payments router under `src/payments` |
| `packages/client` | React + Vite + Tailwind: home, rules, score tracker, online lobby/table, shop |
| `scripts/build_assets.py` | Slices the card sheets / pips / backs / backgrounds into `packages/client/public/assets` and writes the skin manifest |
| `supabase/migrations` | Database schema (profiles, skin catalog, owned skins, payment orders) |
| `docs/SETUP_AUTH_PAYMENTS.md` | Supabase Google OAuth + Revolut Merchant setup |

## Configuration

Copy `.env.example` to `.env` at the repo root — both server and client read it (only `VITE_*` variables reach the browser).
