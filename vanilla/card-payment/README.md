# Card Payment — Vanilla TS

A full, production-shaped integration of Truegate's Card Payment method: the three collector
fields (number / expiration / CVC), live field validation, and submitting a charge.

## ⚠️ Mandatory steps

This example exists to make these explicit — skipping any of them is the most common integration
mistake:

1. **Subscribe to every event before calling `sdk.init()` / `sdk.initCardPayment()`.** Validation
   events fire immediately once the form loads, before you'd have a chance to subscribe later.
2. **Call `sdk.init()` exactly once** per SDK instance, before `initCardPayment()`.
3. **The three container elements must exist in the DOM** before `initCardPayment()` runs — the
   SDK injects its fields into them.
4. **Never call `submit()` while any field is invalid.** Track `*_VALIDATION_RESULT` events and
   gate the submit button on all three being valid — this example does exactly that.
5. **`transactionId` comes from your backend**, not from the SDK. See
   [`docs/prerequisites.md`](../../docs/prerequisites.md).
6. If you loaded the SDK via `<script>` tag, **wait for `SDK_READY`** before constructing an
   instance — handled here in `src/helpers/truegate-sdk-loader.ts`.
7. **A `transactionId` can only be submitted once the request reaches the backend.** If `submit()`
   was called with formally valid data and the backend rejects it (wrong CVV, declined card), the
   same `transactionId` cannot be resubmitted. This example permanently disables the submit button
   the moment a valid `submit()` call is made — it never re-enables it, even on failure. Retrying
   means asking your backend for a new `transactionId`, not re-clicking the button.

   This limit is on the *transaction*, not the *method* — a failed card payment also rules out
   Apple Pay, Google Pay, or PayPal on that same `transactionId`. See
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

[SDK README — Card Payment Integration](https://www.npmjs.com/package/@truegate/sdk-core#card-payment-integration)
