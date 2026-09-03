# D4U Finance — Frontend

Internal expense-management frontend for D4U (Dialogue for Understanding e.V.). See
`CLAUDE.md` in this repo and the root workspace `CLAUDE.md` for full context, and
`documentation/D4U_System_Implementation_Project_Instructions.md` for the product spec.

## Stack

- Next.js (App Router), TypeScript, React
- Tailwind CSS v4, shadcn/ui components (Radix primitives)
- Deployed on Vercel

The UI currently reads from `src/lib/mock-data.ts`, a fixture layer standing in for the
backend API until that exists (see `src/lib/api.ts` for the write-path stub). See this
repo's `CLAUDE.md` for the non-negotiable rule that all writes go through the backend.

## Development

```sh
npm install
npm run dev
```

Then open http://localhost:3000.

## Other scripts

```sh
npm run build   # production build
npm run start   # run a production build locally
npm run lint    # eslint
npm run format  # prettier --write
```
