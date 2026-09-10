# Google Pay — Vanilla TS

A full, production-shaped integration of Truegate's Google Pay method: injecting the button and
handling every state from readiness to a terminal payment outcome. Unlike Card Payment, there's no
`submit()` to call — tapping the injected button opens Google's own payment sheet directly, and
your job is limited to reacting to the events below, not driving the flow forward.

## ⚠️ Mandatory steps

This example exists to make these explicit — skipping any of them is the most common integration
mistake:

1. **Subscribe to every event before calling `sdk.init()` / `sdk.initGooglePay()`.** `GOOGLE_PAY_READY`
   can fire as soon as the button is injected, before you'd have a chance to subscribe later.
2. **Call `sdk.init()` exactly once** per SDK instance, before `initGooglePay()`.
3. **The container element must exist in the DOM** before `initGooglePay()` runs — the SDK injects
   Google's own payment button into it.
4. **`transactionId` comes from your backend**, not from the SDK. See
   [`docs/prerequisites.md`](../../docs/prerequisites.md).
5. If you loaded the SDK via `<script>` tag, **wait for `SDK_READY`** before constructing an
   instance — handled here in `src/helpers/truegate-sdk-loader.ts`.
6. **`GOOGLE_PAY_DISABLED` covers two different situations.** The SDK does not distinguish between
   "Google Pay disabled for this merchant account" and "this browser/user isn't eligible for
   Google Pay" (no Google Pay API, or no card set up with it) — either way, treat it the same: hide
   the button, don't show it as broken.
7. **IMPORTANT — disable the button the instant it's tapped, not after.** Google's own payment
   client refuses a second concurrent sheet outright ("Another PaymentRequest UI is already
   showing"), and the SDK doesn't recognize that as a user cancellation — it reports a genuine
   `PAYMENT_ERROR` and burns the `transactionId` over what was really just an impatient
   double-click, not a failed payment. **This is one of the most common Google Pay integration
   issues merchants run into in production.** `subscribeToSdkEvents()` calls
   `setButtonEnabled(elements, false)` synchronously inside the `GOOGLE_PAY_BUTTON_CLICK` handler —
   before the sheet actually opens — and only re-enables it on `PAYMENT_CANCEL`. See
   `setButtonEnabled()` in `src/main.ts`.
8. **A payment flow ends one of two ways — handle both.** Either `PAYMENT_STATUS` reports a
   terminal status (`SUCCESS` or `FAILED`; `PENDING` means still in progress), or `PAYMENT_ERROR`
   fires on its own with no `PAYMENT_STATUS` to follow. `subscribeToSdkEvents()` routes both into
   `finishPaymentFlow()` in `src/main.ts` — the common bug is handling only the terminal-status
   path and leaving the UI waiting forever after an error. See
   [`docs/prerequisites.md`](../../docs/prerequisites.md).
9. If you offer multiple payment methods on one page (see `all-payment-methods`), remember that a
   `transactionId` is single-use *across* methods, not just within one. See
   [`docs/prerequisites.md`](../../docs/prerequisites.md).

## Run it

```bash
bun install
bun run dev
```

(same with `npm`/`yarn`: `npm install && npm run dev` / `yarn && yarn dev`)

Requires Node `^20.19.0` or `>=22.12.0` — see [`docs/prerequisites.md`](../../docs/prerequisites.md).

Google Pay itself needs a Google account with a card set up in Google Pay, and normally shows up in
Chrome — check there, not in a browser without the Google Pay API.

## Configuration

Everything you're likely to change lives in `src/config.ts`: `SDK_LOADING_MODE` (`<script>` tag vs.
`npm` import), `SDK_ENV` (`TEST`/`PROD`), and `TRANSACTION_ID`. See
[`docs/prerequisites.md`](../../docs/prerequisites.md) for what each one means.

## Further reading

[SDK README — Google Pay Integration](https://www.npmjs.com/package/@truegate/sdk-core#google-pay-integration)
