# Deploying Air Route Game

The game is a static site (no server, no network calls at runtime). Two ways to publish it.

## Option A: Cloudflare Pages (automatic, recommended)

`.github/workflows/deploy.yml` runs typecheck, tests and build, then deploys. Pushes to `main` go to production; pull requests get a preview URL (the branch name becomes the preview subdomain).

What you need to do once:
1. Create a free Cloudflare account at https://dash.cloudflare.com.
2. Workers & Pages > Create > Pages > "Direct Upload", name the project `air-route-game` (if you pick another name, edit `--project-name` in deploy.yml). Upload any placeholder file to create it.
3. Create an API token: My Profile > API Tokens > Create Token > "Edit Cloudflare Workers" template, or a custom token with Account > Cloudflare Pages > Edit.
4. Copy your Account ID (Workers & Pages overview, right-hand side).
5. In GitHub: repo Settings > Secrets and variables > Actions > New repository secret. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
6. Push to `main`. The site appears at `https://air-route-game.pages.dev`.

Netlify works too: connect the repo and it reads `netlify.toml` (publish dir `packages/app/dist`). Cache headers are in `packages/app/public/_headers` (honoured by both hosts).

## Option B: single file on any static host

```
pnpm install
pnpm --filter @arg/app build:single
```

This writes `packages/app/dist-single/index.html` (about 2.2 MB), with all JS, CSS and map data inlined. Drop it on any static host (GitHub Pages, S3, a shared folder) at any path, or just double-click it: it works from `file://`. `pnpm --filter @arg/app preview:single` serves it locally at http://localhost:4173/.

## Build stamp

Settings shows `Build <git short sha> - <date>`, so you can tell which build you are looking at.
