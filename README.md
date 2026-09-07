# D4U Finance — Frontend

Internal expense-management frontend for D4U (Dialogue for Understanding e.V.). See
`CLAUDE.md` in this repo and the root workspace `CLAUDE.md` for full context, and
`documentation/D4U_System_Implementation_Project_Instructions.md` for the product spec.

## Brand guardrails

`brand_guidelines/D4U_brand_guidelines.png` is the visual source of truth for this app. If it conflicts with this README or `CLAUDE.md`, the guideline wins and the docs should be updated to match it.

- Warm palette only: Amber `#D9B87A`, Sand `#CE9A72`, Clay `#AE6631`, Ember `#7B4B27`, with Ink `#231C15`, Stone `#7B6A5D`, Line `#E5E0DC`, and Shell `#F4F2F0` as neutrals. Alarm `#A03D2E` is the only exception color. Do not introduce blue or green accents.
- The logo gradient belongs to the mark alone. Do not reuse gradients in backgrounds, buttons, charts, or decorative UI.
- Typography is split by role: Jost for page titles and section headings; Inter for body copy, labels, tables, and figures. Currency values use tabular numerals.
- Copy stays in German, direct, and in Sie-form. Use product terms users actually say (`Beleg`, `Soll`, `Ist`, `Obligo`, `Umwidmung`, `Vorschuss`) instead of database-style wording.

## Stack

- Next.js (App Router), TypeScript, React
- Tailwind CSS v4, shadcn/ui components (Radix primitives)
- Deployed on Vercel

All four areas (Übersicht, Beleg-Upload, Auswertung, Verwaltung) read real data from
Supabase and write through the real backend (`../d4u_backend`) — not mock data.
`src/lib/mock-data.ts` still exists, but only as a source of shared formatting helpers
(`fmtEUR`, `statusLabel`, etc.) and types, not data. See this repo's `CLAUDE.md` for the
non-negotiable rule that all writes go through the backend, never Supabase directly.

## Running it locally

```sh
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
                              # NEXT_PUBLIC_BACKEND_API_URL (normally http://localhost:3001)
npm run dev
```

Then open **http://localhost:3000**.

**This app needs the backend running too** — logging in works on its own
(that talks to Supabase directly), but submitting an expense, approving
one, or anything in Verwaltung needs `../d4u_backend` running alongside it:

```sh
# terminal 1 — this repo
cd d4u_webapp && npm run dev

# terminal 2 — the backend
cd ../d4u_backend && npm run dev
```

If backend calls start failing with a connection error after previously
working, check that `NEXT_PUBLIC_BACKEND_API_URL` in this repo's
`.env.local` still matches the port the backend actually started on — if
port 3001 was already taken, Next.js silently starts it on 3002/3003/...
instead, and this env var won't follow automatically. `npm run dev` now
kills anything already bound to port 3000 first (`predev`), so this app
itself should always come up on the same port.

## Other scripts

```sh
npm run build           # production build
npm run start           # run a production build locally
npm run lint             # eslint, report only
npm run lint:fix         # eslint --fix, applies safe fixes
npm run format           # prettier --write .
npm run format:prettier  # same as `format`, explicit alias
npm run vercel:check     # tsc --noEmit + eslint — run before pushing to
                          # catch what a Vercel build would fail on (broken
                          # imports, bad casing, lint errors) before it
                          # costs a deploy
```

### Clean-up scripts

Run before committing or opening a PR:

```sh
npm run lint:fix       # auto-fix lint issues
npm run format         # auto-fix formatting
npm run vercel:check   # verify both are clean, plus type-check
```

`vercel:check` exists because Vercel's Linux build is case-sensitive about
import paths in a way macOS's filesystem isn't — a `./components/Foo`
import that resolves fine locally on a case-insensitive filesystem can
fail on Vercel if the actual file is `foo.tsx`. `tsconfig.json` sets
`forceConsistentCasingInFileNames: true` so `tsc` catches this locally,
before it becomes a failed deploy.
