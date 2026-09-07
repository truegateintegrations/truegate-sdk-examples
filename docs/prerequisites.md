# Prerequisites

Shared background for every example in this repository — read this once, not per example.

## `transactionId`

Every example needs a `transactionId`. It's issued by **your own backend**, calling Truegate's
`/start` endpoint — the SDK does not create it for you. In every example it's a placeholder,
`<your_transaction_id>`, in `src/config.ts`. Replace it with a real value before running the demo
against live data.

## `TEST` vs `PROD`

`SDK_ENV` in `src/config.ts` controls which Truegate environment the SDK talks to. Not every
payment integration is available outside `PROD` — check with Truegate which methods your account
has enabled in `TEST`.

## Loading mode: `<script>` tag vs. `npm` import

Each example can load the SDK two ways, toggled by a single constant, `SDK_LOADING_MODE`, in
`src/config.ts`:

- `'SCRIPT'` (default) — injects `<script src="https://sdk(.test).truegate.tech/sdk.js">` and
  waits for the `SDK_READY` message before creating an instance. No rebuild needed to pick up a
  new SDK release.
- `'NPM'` — imports `@truegate/sdk-core` directly. Pins the SDK version in your lockfile; upgrading
  means bumping the dependency.

## Subresource Integrity (SRI)

Only relevant for `'SCRIPT'` loading mode. Set `SDK_VERSION` and `SDK_SCRIPT_INTEGRITY` in
`src/config.ts` to pin an exact SDK version and verify it via SRI. Hashes are published in the
[SDK README](https://www.npmjs.com/package/@truegate/sdk-core#subresource-integrity-sri-hashes).
Leave both `undefined` (the default) if you don't need SRI — most integrations don't.

## Node.js version

Examples use Vite for the dev server/build. Vite 8 requires Node `^20.19.0` or `>=22.12.0` —
older Node 20.x patch releases (below `.19`) will fail with a cryptic `node:util` error on build.
