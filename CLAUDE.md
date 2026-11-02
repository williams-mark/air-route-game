# Air Route Game

Single-player, pausable real-time airline management game. TypeScript, pnpm workspaces, Vite + React + Zustand. Sim runs in a Web Worker later; it must stay pure, seeded and deterministic.

## Layout
- `packages/contracts` shared types. Edit only in a PR that changes nothing else.
- `packages/sim` pure simulation (no DOM, no Date.now, no Math.random; use `makeRng`).
- `packages/data` sourced airports and aircraft (California and Hawaii only for week one, campaign 2015-2025).
- `packages/app` UI. Colors via CSS variables in `theme.css`; always support light and dark.

## Rules
- `main` must always pass `pnpm typecheck && pnpm test && pnpm build`.
- One branch per lane (`lane/sim`, `lane/map`, ...), small PRs, merge only when green.
- Data needs a source note. Never invent aircraft or airport figures.
- Read STATUS.md first for task states and known issues; update it before ending a session.
- Build plan: "Air Route Game: Week-One Build Plan" in the Claude project.
