# PayPal — Vanilla TS

A full, production-shaped integration of Truegate's PayPal method: injecting the button and
handling every state from readiness to a terminal payment outcome. Unlike Card Payment, there's no
`submit()` to call — tapping the injected button opens PayPal's own checkout popup directly, and
your job is limited to reacting to the events below, not driving the flow forward.

## ⚠️ Mandatory steps

This example exists to make these explicit — skipping any of them is the most common integration
mistake:

1. **Subscribe to every event before calling `sdk.init()` / `sdk.initPayPal()`.** `PAY_PAL_READY`
   can fire as soon as the button is injected, before you'd have a chance to subscribe later.
2. **Call `sdk.init()` exactly once** per SDK instance, before `initPayPal()`.
3. **The container element must exist in the DOM** before `initPayPal()` runs — the SDK injects
   PayPal's own Buttons widget into it.
4. **`transactionId` comes from your backend**, not from the SDK. See
   [`docs/prerequisites.md`](../../docs/prerequisites.md).
5. If you loaded the SDK via `<script>` tag, **wait for `SDK_READY`** before constructing an
   instance — handled here in `src/helpers/truegate-sdk-loader.ts`.
6. **`PAY_PAL_DISABLED` and `INIT_PAY_PAL_ERROR` are *not* interchangeable.** `PAY_PAL_DISABLED`
   means PayPal isn't configured for this merchant account. Browser/device ineligibility is a
   separate case that surfaces through `INIT_PAY_PAL_ERROR` instead (along with any other init
   failure — the SDK doesn't split those two apart).
7. **There is no `PAYMENT_CANCEL` for PayPal.** Closing PayPal's popup without approving fires
   nothing on this SDK at all — PayPal's own widget silently resets itself and stays clickable.
   Don't build UI logic that waits for a cancel signal; it will never come.
8. **Disable the button once the flow reaches a terminal state.** PayPal's button is mounted
   independently of the Truegate SDK instance, so it survives `destroy()` and stays clickable —
   tapping it after the flow is over would still try to open a new order against a finished
   `transactionId`, with the SDK now deaf to whatever happens next. `finishPaymentFlow()` in
   `src/main.ts` disables it there for exactly that reason.
9. **A payment flow ends one of two ways — handle both.** Either `PAYMENT_STATUS` reports a
   terminal status (`SUCCESS` or `FAILED`; `PENDING` means still in progress), or `PAYMENT_ERROR`
   fires on its own with no `PAYMENT_STATUS` to follow. `subscribeToSdkEvents()` routes both into
   `finishPaymentFlow()` in `src/main.ts` — the common bug is handling only the terminal-status
   path and leaving the UI waiting forever after an error. See
   [`docs/prerequisites.md`](../../docs/prerequisites.md).
10. If you offer multiple payment methods on one page (see `all-payment-methods`), remember that a
    `transactionId` is single-use *across* methods, not just within one. See
    [`docs/prerequisites.md`](../../docs/prerequisites.md).

## Run it

```bash
bun install
bun run dev
```

(same with `npm`/`yarn`: `npm install && npm run dev` / `yarn && yarn dev`)

Requires Node `^20.19.0` or `>=22.12.0` — see [`docs/prerequisites.md`](../../docs/prerequisites.md).

## Configuration

Everything you're likely to change lives in `src/config.ts`: `SDK_LOADING_MODE` (`<script>` tag vs.
`npm` import), `SDK_ENV` (`TEST`/`PROD`), and `TRANSACTION_ID`. See
[`docs/prerequisites.md`](../../docs/prerequisites.md) for what each one means.

## Further reading

[SDK README — PayPal Integration](https://www.npmjs.com/package/@truegate/sdk-core#paypal-integration)
