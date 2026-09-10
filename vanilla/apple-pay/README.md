# Apple Pay — Vanilla TS

A full, production-shaped integration of Truegate's Apple Pay method: injecting the button and
handling every state from readiness to a terminal payment outcome. Unlike Card Payment, there's no
`submit()` to call — tapping the injected button opens Apple's own payment sheet directly, and your
job is limited to reacting to the events below, not driving the flow forward.

## ⚠️ Mandatory steps

This example exists to make these explicit — skipping any of them is the most common integration
mistake:

1. **Subscribe to every event before calling `sdk.init()` / `sdk.initApplePay()`.** `APPLE_PAY_READY`
   can fire as soon as the button is injected, before you'd have a chance to subscribe later.
2. **Call `sdk.init()` exactly once** per SDK instance, before `initApplePay()`.
3. **The container element must exist in the DOM** before `initApplePay()` runs — the SDK injects
   Apple's own `<apple-pay-button>` element into it.
4. **`transactionId` comes from your backend**, not from the SDK. See
   [`docs/prerequisites.md`](../../docs/prerequisites.md).
5. If you loaded the SDK via `<script>` tag, **wait for `SDK_READY`** before constructing an
   instance — handled here in `src/helpers/truegate-sdk-loader.ts`.
6. **`APPLE_PAY_DISABLED` covers two different situations.** The SDK does not distinguish between
   "Apple Pay disabled for this merchant account" and "Apple Pay unavailable in this browser/device"
   (it only ever renders in Safari, on Apple hardware that supports it) — either way, treat it the
   same: hide the button, don't show it as broken.
7. **IMPORTANT — disable the button the instant it's tapped, not after.** Safari itself refuses a
   second concurrent `ApplePaySession`: a fast double-click, or an impatient retry while the sheet
   is still opening, throws `InvalidAccessError: Page already has an active payment session` — and
   the SDK's own click handler doesn't catch it, so it surfaces as an uncaught error instead of
   failing quietly. **This is one of the most common Apple Pay integration issues merchants run
   into in production.** `subscribeToSdkEvents()` calls `setButtonEnabled(elements, false)`
   synchronously inside the `APPLE_PAY_BUTTON_CLICK` handler — before the sheet actually opens —
   and only re-enables it on `PAYMENT_CANCEL`. See `setButtonEnabled()` in `src/main.ts`.
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

Apple Pay itself only renders in Safari, on a device/account with Apple Pay set up — check in
Safari on macOS or iOS, not in Chrome/Firefox.

## Configuration

Everything you're likely to change lives in `src/config.ts`: `SDK_LOADING_MODE` (`<script>` tag vs.
`npm` import), `SDK_ENV` (`TEST`/`PROD`), and `TRANSACTION_ID`. See
[`docs/prerequisites.md`](../../docs/prerequisites.md) for what each one means.

## Further reading

[SDK README — Apple Pay Integration](https://www.npmjs.com/package/@truegate/sdk-core#apple-pay-integration)
