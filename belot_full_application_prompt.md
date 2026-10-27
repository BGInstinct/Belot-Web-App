# TASK: Build a Full-Featured Cross-Platform Belot Web Application & Game Engine

## Project Overview

Build a real-time multiplayer Belot card game app with comprehensive room management, physical score-tracking tools, custom rules toggles, internationalization (Bulgarian/English), and cosmetic customization.

The game features a distinctive **Retro / Pixel-Art Visual Style**. All UI elements, fonts, desk backgrounds, and card assets will strictly adhere to this pixelated aesthetic using locally provided asset paths.

---

## Technical Stack & Infrastructure

1. **Frontend**: React (Vite) + Tailwind CSS + Lucide Icons + Framer Motion.
2. **Backend**: Node.js with `Colyseus.js` or `Socket.io` + Express server.
3. **Database & Auth**: Supabase or Firebase (Google OAuth 2.0 integration & Guest sessions).
4. **Payment Gateway**: Revolut Merchant API / Revolut Checkout Web SDK (supports Revolut Pay, Cards, Google Pay, Apple Pay).

---

## Visual Design System & Asset Pipeline (Pixel Art Theme)

### Asset & Typography Guidelines

* **Custom Pixel Font**: Load the project font file (`.ttf`/`.woff2`) via `@font-face` (e.g., `'PixelFont'`) and set it as the global default typeface across all headings, buttons, scoreboards, and game texts.
* **Pixel Rendering**: Set `image-rendering: pixelated` (and `-webkit-optimize-contrast`) on the game container and all sprite/card elements to prevent blurriness when scaling.
* **Asset Directory Structure**:
  ```
  /public
  └── /assets
      ├── /fonts
      │   └── custom-pixel-font.ttf
      ├── /backgrounds
      │   └── default-desk.png
      └── /skins
          ├── /default
          │   ├── /cards (e.g., 7_spades.png, J_hearts.png, back.png)
          │   └── suit-icons (pixelated ♠, ♥, ♦, ♣)
          └── /custom-skins
              └── [skin_id_folders]
  ```

---

## 1. Screen Architecture & Core Features

### Home Screen Requirements

* **Pixelated Theme Frame**: Styled with pixel borders, chunky retro buttons, and themed canvas elements.
* **Google OAuth Login / Guest Login**: Quick authentication button at the top right.
* **Navigation Buttons**:
  * `Play Online`: Enter room flow (Create or Join).
  * `Physical Score Tracker`: Standalone scorekeeper tool for physical card games.
  * `Full Rules`: Opens a full-screen modal/page containing the standard Belot rules (provided in Markdown).
  * `Language Selector`: Toggle between **English (EN)** and **Bulgarian (BG)**.

### Custom Room Creation & Lobby Options

When creating an online room, the host can configure the following custom toggles:

1. **Forced Overtrump / Higher Placement Rules (`forceHigherCardPlacement`)**: Toggle whether players are strictly forced to play a higher card/trump or if standard relaxed trumping rules apply.
2. **Manual Announcement Mode (`manualAnnounceOnly`)**:
   * When **enabled**, the system will **NOT** automatically prompt or auto-declare combinations (Tierce, Fifty, Hundred, Carre).
   * Players must manually click an "Announce" button on their UI during their turn when playing their first card to register their announcements.
3. **Turn Thinking Timer (`turnTimerSeconds`)**: Adjustable timer per move (e.g., 15s, 30s, 45s, 60s).
4. **Room Code System**: Generates a 6-character room code for friends to join directly.

### Physical Game Score Tracker (Offline Tool)

A dedicated UI for scoring physical, real-world card games between two teams:

* Team A vs Team B real-time score input.
* Input fields for contract bids, tricks won, extra points (Last 10, Belot, Announcements).
* Automatic point conversion (division by 10 & Belot rounding rules applied).
* Match win threshold tracker (First to 151+ points, accounting for the "Capo cannot finish" rule).

### Game Table UI & Cosmetic Hints

* **Desk Background**: Rendered using the user-provided pixel background image (`/assets/backgrounds/default-desk.png`).
* **Suit Equivalence Hint Badge**: Because custom card skins alter the visual appearance of suits, display a small non-intrusive reference widget in the corner showing equivalent suit mappings (e.g., `⚡ = ♠ Spades`, `🔥 = ♥ Hearts`).
* **Interactive Action Bar**:
  * Contextual pixel-art buttons for Bidding, Playing, declaring **Belot**, and manual **Announcements**.
  * Turn timer progress bar.

---

## 2. Payment Integration Strategy: Revolut Merchant API

To process microtransactions for cosmetic skins (card backs, felt themes, avatar borders):

### Integration Pipeline

1. **Provider**: **Revolut Merchant API** via the `@revolut/checkout` Web SDK.
2. **Supported Payment Options**: Revolut Pay (1-click checkout), Debit/Credit Cards, Apple Pay, Google Pay.
3. **Backend Workflow**:
   ```
   [ Client: Click Buy Skin ] ──> [ Express Server API Endpoint ]
                                              │
                                              ▼
                                 [ Revolut Merchant API: Create Order ]
                                              │
                                              ▼
   [ Client mounts RevolutPay / Widget ] <── [ Returns Public Order Token ]
                                              │
   [ Webhook Notification / Sync ] ───────────┴──> [ Database: Grant Skin to User ]
   ```
4. **Alternative Low-Cost Gateways**: Stripe Checkout, Lemonsqueezy, or Paddle for automated VAT/tax compliance across Europe.

---

## 3. Game Engine Rules Reference (Embedded Document)

The game server state machine and scoring logic must strictly adhere to the following ruleset:

```
# How to Play Belot (Official Rules)

**Belot** is a trick-taking card game for 4 players, played in two teams of two (partners sit opposite each other). The game uses a standard 32-card deck (cards 2 through 6 removed).

Stages: 1. Dealing | 2. Bidding | 3. Gameplay | 4. Scoring

## 1. Dealing
- Cards are dealt counter-clockwise.
- 3 cards dealt, then 2 cards (5 total per player for bidding phase).
- Remaining 3 cards per player are dealt after bidding concludes.

## 2. Bidding
- Bidding starts to the right of the dealer.
- Modes: Suit (Clubs < Diamonds < Hearts < Spades), No Trumps, All Trumps.
- Card Ranks:
  - Trump Suit: J (20) > 9 (14) > A (11) > 10 (10) > K (4) > Q (3) > 8 (0) > 7 (0)
  - Non-Trump: A (11) > 10 (10) > K (4) > Q (3) > J (2) > 9 (0) > 8 (0) > 7 (0)
  - No Trumps: A (11) > 10 (10) > K (4) > Q (3) > J (2) > 9 (0) > 8 (0) > 7 (0)
  - All Trumps: J (20) > 9 (14) > A (11) > 10 (10) > K (4) > Q (3) > 8 (0) > 7 (0)
- Contra doubles points; Recontra quadruples points.
- Bidding ends after 3 consecutive passes.

## 3. Gameplay
- First card led by player to dealer's right. Must follow suit.
- Trump Game: Must follow suit; if lacking suit and opponent holds trick, must play trump.
- All Trumps: Must follow suit and must play a higher card than the highest on table if possible.

## 4. Scoring & Rounding
- Base Totals: Suit Game = 162 pts | All Trumps = 258 pts | No Trumps = 130 pts (doubled to 260 pts).
- Points divided by 10 and rounded to nearest integer.
- Contract Outcomes:
  - Made (Izkarana): Bidding team scores higher; both teams record points.
  - Failed (Vkarana): Bidding team scores lower; opposing team receives ALL points.
  - Hanging (Visyashta): Tie; declarer points roll over to winner of next round.
- Winning match threshold: 151+ points. Cannot win on a round ending in Capo or all-pass.

## 5. Announcements (Anonsi)
- Announced on playing first card:
  - Tierce (3 in a row): 20 pts
  - Fifty / Kvarta (4 in a row): 50 pts
  - Hundred / Kvinta (5 in a row): 100 pts
  - Carre (Four 10s, Qs, Ks, As): 100 pts | Four 9s: 150 pts | Four Jacks: 200 pts
  - Belot (Q + K of trump suit): 20 pts
  - Last 10 (Posledno 10): 10 pts | Capo / Valat: 90 bonus pts
```