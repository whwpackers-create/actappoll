# ACT — All Cup Tour

Mario Kart Wii–style league tracking with Elo rankings, ACTs, SATs, and seasons.

## Setup

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your Firebase config:

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase client config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase client config |
| `VITE_FIREBASE_PROJECT_ID` | Firebase client config |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase client config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase client config |
| `VITE_FIREBASE_APP_ID` | Firebase client config |

Get these from **Firebase Console → Project Settings → General → Your apps**.

> **Note:** Firebase client config is public by design; security is enforced via Firestore rules. The admin password is stored in Firebase `config/admin`, not in env vars.

### Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Build

```bash
npm run build
```

Output in `dist/`. Preview with `npm run preview`.

## Project Structure

```
src/
├── main.tsx          # Entry point
├── App.tsx           # Root, routing, auth gate
├── config/firebase.ts # Firebase init
├── services/firestore.ts
├── utils/elo.ts
├── styles/
│   ├── index.css     # Global styles, MKWii font, media queries
│   └── theme.ts      # Fonts, colors, theme object
└── components/       # Login, Dashboard, NavBar, etc.
```

## Reference

Original monolithic site preserved in `index (95).html` for reference. Migration complete — see `MIGRATION_PLAN.md` for details.
