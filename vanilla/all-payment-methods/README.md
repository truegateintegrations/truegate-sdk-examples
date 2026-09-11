# All Payment Methods — Vanilla TS

A realistic checkout page: Card Payment, Apple Pay, Google Pay, and PayPal on one page, sharing a
single `transactionId`. This is not four separate examples glued together — it's what changes when
several methods have to coexist safely on the same transaction.

## ⚠️ Mandatory steps

This example exists to make these explicit — skipping any of them is the most common integration
mistake:

1. **One shared "transaction consumed" flag for all four methods, not one per button.**
   `transactionId` is single-use for the whole transaction, not per method (see
   [`docs/prerequisites.md`](../../docs/prerequisites.md)). If a formally valid attempt on *any*
   method reaches the backend and fails there, the transactionId is burned for every method on the
   page — not just the one that was tried. `isTransactionConsumed` in `src/main.ts` is the single
   source of truth; locking only the clicked button would leave the others looking like a valid
   "try a different way to pay" fallback, when they'd actually just fail the same way against the
   same dead transactionId.
2. **A method being unavailable must not stop the others from initializing.** Each
   `init*Method()` in `src/main.ts` catches its own failure independently — `initApplePay()`
   rejecting (say, Apple Pay disabled for this account) must never take down Card Payment,
   Google Pay, or PayPal. They're initialized together with `Promise.all()`, each wrapped in its
   own `try`/`catch`.
3. **Card Payment can pre-emptively lock every other method; the wallet methods can't.**
   `CARD_PAYMENT_SUBMIT` is the SDK's explicit "now actually talking to the backend" signal — no
   equivalent exists for Apple Pay/Google Pay/PayPal. So a card submission locks all four methods
   the moment it starts (before its outcome is even known), while a wallet button click can only
   lock *its own* button — locking every method from a wallet click would be wrong, since a
   cancelled sheet never touches the backend at all.
4. **Subscribe to every event before calling `sdk.init()` and any `init*` method call.** Some
   events (validation results, `*_READY`) can fire as soon as a form/button is injected.
5. **Call `sdk.init()` exactly once** per SDK instance, before any `init*` method call.
6. **Every container element must exist in the DOM** before its corresponding `init*` call runs.
7. **`transactionId` comes from your backend**, not from the SDK. See
   [`docs/prerequisites.md`](../../docs/prerequisites.md).
8. If you loaded the SDK via `<script>` tag, **wait for `SDK_READY`** before constructing an
   instance — handled here in `src/helpers/truegate-sdk-loader.ts`.
9. **A payment flow ends one of two ways — handle both.** Either `PAYMENT_STATUS` reports a
   terminal status (`SUCCESS` or `FAILED`; `PENDING` means still in progress), or `PAYMENT_ERROR`
   fires on its own with no `PAYMENT_STATUS` to follow. `subscribeToSdkEvents()` routes both into
   `finishTransaction()` in `src/main.ts`, which locks every method and calls `sdk.destroy()`.
10. **A disabled/ineligible method's button is hidden, not just dimmed.** `*_DISABLED` and
    `INIT_*_ERROR` remove that one button from layout (`hideButton()`) — it was never going to work
    here, unlike a temporary lock during checkout, which just dims a button in place
    (`setButtonEnabled()`) without reflowing the page.

## Run it

```bash
bun install
bun run dev
```

(same with `npm`/`yarn`: `npm install && npm run dev` / `yarn && yarn dev`)

Requires Node `^20.19.0` or `>=22.12.0` — see [`docs/prerequisites.md`](../../docs/prerequisites.md).

Apple Pay and Google Pay only render under their own browser/account conditions — see the
`apple-pay` and `google-pay` examples. PayPal and Card Payment render everywhere.

## Configuration

Everything you're likely to change lives in `src/config.ts`: `SDK_LOADING_MODE` (`<script>` tag vs.
`npm` import), `SDK_ENV` (`TEST`/`PROD`), and `TRANSACTION_ID`. See
[`docs/prerequisites.md`](../../docs/prerequisites.md) for what each one means.

## Further reading

[SDK README — Handling Transaction Status](https://www.npmjs.com/package/@truegate/sdk-core#handling-transaction-status)
