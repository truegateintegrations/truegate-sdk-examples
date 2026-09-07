# Truegate SDK — Integration Examples

Copy-paste-ready integration examples for [`@truegate/sdk-core`](https://www.npmjs.com/package/@truegate/sdk-core),
covering every payment method and both ways of loading the SDK.

> 🚧 This repository is still being filled in. The architecture and the list of examples are
> tracked in [`EXAMPLES_PLAN.md`](./EXAMPLES_PLAN.md), along with open questions.

## Examples

| Payment method                 | Vanilla TS                       | React | Vue |
|---------------------------------|----------------------------------|-------|-----|
| Card Payment                    | [ready](./vanilla/card-payment)  | —     | —   |
| Apple Pay                       | coming soon                      | —     | —   |
| Google Pay                      | coming soon                      | —     | —   |
| PayPal                          | coming soon                      | —     | —   |
| All methods at once (checkout)  | coming soon                      | —     | —   |

React and Vue examples will follow later, in the same shape as the vanilla ones.

## How each example is structured

Every example folder is self-contained — you can copy it on its own, it has no dependency on any
other example in this repository. Install and run are the same everywhere:

```bash
bun install
bun run dev
```

(same with `npm`/`yarn`: `npm install && npm run dev` / `yarn && yarn dev`)

How the SDK is loaded (`<script>` tag vs. `npm` import) and which environment it targets
(`TEST`/`PROD`) are both toggled with a single constant in that example's `src/config.ts` — see
[`docs/prerequisites.md`](./docs/prerequisites.md) for details.

## Before you start

Read [`docs/prerequisites.md`](./docs/prerequisites.md) — it covers `transactionId`, `TEST`/`PROD`,
SRI, and the Node.js version each example needs.
