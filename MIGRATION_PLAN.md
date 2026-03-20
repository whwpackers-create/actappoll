# ACT — All Cup Tour — Migration Plan

> **Reference:** Original site preserved in `index (95).html` until migration is complete.

## Overview

Migrate the monolithic HTML/React app to a proper Vite + React + **TypeScript** project with environment variables, modular structure, and modern tooling.

---

## Phase 1: Scaffold & Environment ✅

**Goal:** Vite React project with env vars and Firebase wired up.

- [ ] Create Vite React project
- [ ] Add `.env` and `.env.example` (gitignore `.env`)
- [ ] Create `src/config/firebase.js` — Firebase init using `import.meta.env.VITE_*`
- [ ] Create `src/services/firestore.js` — `fsGet`, `fsSet`, `fsDel`, `loadAllData`, `saveLocal`, `loadLocal`, `gid`
- [ ] Create `src/utils/elo.js` — Elo calculations (`computeAllElos`, `computeSeasonElos`, `computeStats`, `teamScores`, etc.)
- [ ] Minimal `App.jsx` that loads data and renders a placeholder
- [ ] Verify Firebase connection works

**Deliverable:** `npm run dev` runs a working app that connects to Firestore.

---

## Phase 2: Component Extraction

**Goal:** Split the monolithic script into React components.

| Component | Source (approx lines) | Notes |
|-----------|------------------------|-------|
| `App.tsx` | Root, routing, auth gate | Main shell + view state |
| `Login.tsx` | ~750–770 | Password auth |
| `Dashboard.tsx` | ~600–900 | Main dashboard, leaderboard, menu |
| `NewAct.tsx` | ~1100–1400 | Create/edit ACT flow |
| `History.tsx` | ~1500–1600 | ACT history list |
| `Roster.tsx` | ~1600–1800 | Player management |
| `Seasons.tsx` | ~2500–2595 | Season view |
| `Analytics.tsx` | ~2605–2750 | Elo chart |
| `Chooser.tsx` | Team/player picker | Shared component |
| `Settings.tsx` | Menu images, theme | Admin settings |

**Order:** App → Login → Dashboard → NewAct → History → Roster → Seasons → Analytics → Chooser → Settings

**Deliverable:** All views working; no functionality lost.

---

## Phase 3: Styles & Cleanup ✅

**Goal:** Organize styles, remove inline clutter.

- [x] Extract global CSS to `src/styles/index.css` (fonts, body, #root, media queries)
- [x] Extract MKWii font (consider external file or keep base64 if small)
- [x] Move shared style objects to `src/styles/theme.js` or CSS variables
- [x] Remove CDN scripts from HTML; ensure build uses npm packages
- [x] Add README with setup instructions and env var documentation

**Deliverable:** Clean, maintainable styling; documented setup.

---

## Project Structure (Target)

```
actappoll/
├── .env                    # Gitignored
├── .env.example            # Template (no real values)
├── index.html              # Minimal shell
├── package.json
├── tsconfig.json
├── vite.config.ts
├── MIGRATION_PLAN.md        # This file
├── index (95).html          # Original (reference only)
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── types/
    │   └── index.ts
    ├── config/
    │   └── firebase.ts
    ├── services/
    │   └── firestore.ts
    ├── utils/
    │   └── elo.ts
    ├── components/
    │   ├── Login.jsx
    │   ├── Dashboard.jsx
    │   ├── NewAct.jsx
    │   ├── History.jsx
    │   ├── Roster.jsx
    │   ├── Seasons.jsx
    │   ├── Analytics.jsx
    │   ├── Chooser.jsx
    │   └── Settings.jsx
    └── styles/
        └── index.css
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase client config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase client config |
| `VITE_FIREBASE_PROJECT_ID` | Firebase client config |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase client config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase client config |
| `VITE_FIREBASE_APP_ID` | Firebase client config |

**Note:** Firebase client config is designed to be public; security is enforced via Firestore rules. Admin password stays in Firebase `config/admin` doc, not in env.

---

## Checklist Before Merge

- [ ] All phases complete
- [ ] `npm run build` succeeds
- [ ] App matches original behavior
- [ ] `.env` in `.gitignore`
- [ ] README updated with setup steps
