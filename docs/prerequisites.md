# Prerequisites

Shared background for every example in this repository — read this once, not per example.

## `transactionId`

Every example needs a `transactionId`. It's issued by **your own backend**, calling Truegate's
`/start` endpoint — the SDK does not create it for you. In every example it's a placeholder,
`<your_transaction_id>`, in `src/config.ts`. Replace it with a real value before running the demo
against live data.

**A `transactionId` is single-use, and that limit applies across payment methods, not just within
one.** Once a formally valid attempt reaches the backend and fails on one method (say, a declined
card), you cannot then try a *different* method (Apple Pay, Google Pay, PayPal) with that same
`transactionId` — it needs a fresh one from your backend, same as retrying the same method would.
If you offer multiple payment methods on one page (see `all-payment-methods`), a failure on one
must not silently leave the others usable with the now-consumed `transactionId`.

## Ending the payment flow: two exits, not one

A payment flow finishes one of two ways, and both must close out your checkout UI (modal,
redirect, stop polling — whatever your integration does):

1. **`PAYMENT_STATUS` with a non-pending status.** `PENDING` means "still in progress" — keep
   waiting. Anything else (`SUCCESS`, `FAILED`) is terminal, and not all terminal statuses are positive.
2. **`PAYMENT_ERROR`.** This is a dead end on its own — no `PAYMENT_STATUS` event follows it.

The common mistake is handling only the first exit: a merchant page that waits for a terminal
`PAYMENT_STATUS` and ignores `PAYMENT_ERROR` will wait forever once an error actually occurs,
because no status is ever coming. Subscribe to both, and treat both as "the flow is over."

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
