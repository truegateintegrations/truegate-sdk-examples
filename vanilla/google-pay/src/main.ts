import { SDK_ENV, TRANSACTION_ID } from './config'
import { loadTruegateSdk } from './helpers/truegate-sdk-loader'
import type { SdkInstancePublic } from './types/vendors/truegate-sdk'

const GOOGLE_PAY_BUTTON_ELEMENT_ID = 'google-pay-button'

interface PageElements {
  statusElement: HTMLParagraphElement
  buttonContainer: HTMLDivElement
}

const getPageElements = (): PageElements => {
  const statusElement = document.querySelector<HTMLParagraphElement>('#status')
  const buttonContainer = document.querySelector<HTMLDivElement>(`#${GOOGLE_PAY_BUTTON_ELEMENT_ID}`)

  if (!statusElement || !buttonContainer) {
    throw new Error('Google Pay demo: required DOM elements are missing')
  }

  return { statusElement, buttonContainer }
}

const setStatus = (elements: PageElements, text: string): void => {
  elements.statusElement.textContent = text
}

// Dims the button and blocks clicks in place, without touching layout — a checkout
// page shouldn't visibly jump every time the button's state changes.
const setButtonEnabled = (elements: PageElements, isEnabled: boolean): void => {
  elements.buttonContainer.classList.toggle('is-disabled', !isEnabled)
}

// The only statuses that end a payment flow — everything else on PAYMENT_STATUS
// (e.g. PENDING) just means "still in progress".
const TERMINAL_PAYMENT_STATUSES = ['SUCCESS', 'FAILED']

// A payment flow ends one of two ways: a terminal PAYMENT_STATUS, or PAYMENT_ERROR
// firing on its own with no PAYMENT_STATUS to follow. Both must be handled — a
// merchant UI that only waits for a terminal status can hang forever after an error.
// In a real integration this is where you'd close the checkout modal, redirect back
// to your order page, stop polling your own backend, etc.
//
// destroy() belongs here, not on page unload: once the flow is over the transactionId
// is spent either way, so nothing meaningful can ever happen on this instance again.
// Calling it here is what actually stops a late/duplicate event from re-running this
// same completion logic a second time.
//
// Disabling the button matters just as much: it's Google's own injected button
// element, so it stays in the DOM and fully clickable after destroy() — tapping it
// would try to open a real Google Pay sheet again with an SDK instance that's now deaf
// to every event.
const finishPaymentFlow = (sdk: SdkInstancePublic, elements: PageElements, reason: string): void => {
  console.log(`Truegate: payment flow finished — ${reason}`)
  sdk.destroy()
  setButtonEnabled(elements, false)
}

// Subscribe to every event BEFORE calling init()/initGooglePay() — some of them
// (e.g. GOOGLE_PAY_READY) can fire as soon as the button is injected.
const subscribeToSdkEvents = (sdk: SdkInstancePublic, elements: PageElements): void => {
  sdk.on('INIT_PAYMENTS_LOADING', () => {
    console.log('Truegate: initializing payment methods…')
  })

  sdk.on('INIT_PAYMENTS_ERROR', () => {
    setStatus(elements, 'Failed to initialize Truegate payments.')
  })

  // Covers two different situations the SDK doesn't distinguish between: Google Pay
  // disabled for this merchant account, and this browser/user not being eligible for
  // Google Pay (no Google Pay API available, or no card set up with it). Either way,
  // treat it the same — no button was ever injected, so there's nothing to show but the
  // status.
  sdk.on('GOOGLE_PAY_DISABLED', () => {
    setStatus(elements, 'Google Pay is not available.')
  })

  sdk.on('INIT_GOOGLE_PAY_ERROR', () => {
    setStatus(elements, 'Failed to load the Google Pay button.')
  })

  sdk.on('GOOGLE_PAY_READY', () => {
    setStatus(elements, 'Google Pay ready — tap the button to pay.')
  })

  // IMPORTANT — one of the most common Google Pay issues merchants run into in
  // production. Google's own payment client refuses a second concurrent sheet outright
  // ("Another PaymentRequest UI is already showing"), and the SDK doesn't recognize that
  // as a user cancellation — it reports a genuine PAYMENT_ERROR and burns the
  // transactionId over what was really just an impatient double-click, not a failed
  // payment. Disabling the button synchronously, before the sheet actually opens, keeps
  // a fast second click from ever reaching it.
  sdk.on('GOOGLE_PAY_BUTTON_CLICK', () => {
    setButtonEnabled(elements, false)
    setStatus(elements, 'Opening Google Pay…')
  })

  // Unlike PAYMENT_ERROR/a terminal PAYMENT_STATUS, a cancel doesn't end the flow: the
  // user dismissed Google's sheet before the SDK ever attempted the transaction, so the
  // transactionId is still unused. Re-enable the button and don't destroy() — the point
  // is to let them tap it again.
  sdk.on('PAYMENT_CANCEL', () => {
    setButtonEnabled(elements, true)
    setStatus(elements, 'Payment was cancelled. You can try again.')
  })

  sdk.on('PAYMENT_ERROR', () => {
    setStatus(elements, 'Payment failed. This transaction cannot be retried — request a new transactionId.')
    finishPaymentFlow(sdk, elements, 'PAYMENT_ERROR')
  })

  sdk.on('PAYMENT_STATUS', (event) => {
    setStatus(elements, `Payment status: ${event.details.status}`)

    if (!TERMINAL_PAYMENT_STATUSES.includes(event.details.status)) {
      return
    }

    finishPaymentFlow(sdk, elements, `PAYMENT_STATUS: ${event.details.status}`)
  })
}

const initGooglePayDemo = async (): Promise<void> => {
  const elements = getPageElements()

  setStatus(elements, 'Loading Truegate SDK…')

  const TruegateSdk = await loadTruegateSdk()

  const sdk = new TruegateSdk({
    id: 'google-pay-demo',
    transactionId: TRANSACTION_ID,
    env: SDK_ENV,
  })

  subscribeToSdkEvents(sdk, elements)

  await sdk.init()

  // Unlike Card Payment, there's no separate submit() call to make — tapping the
  // injected button opens Google's own payment sheet, and the SDK reports the outcome
  // through the PAYMENT_STATUS/PAYMENT_ERROR events subscribed to above.
  await sdk.initGooglePay({
    id: GOOGLE_PAY_BUTTON_ELEMENT_ID,
    buttonOptions: {
      TYPE: 'BUY',
      THEME: 'BLACK',
    },
  })

  // No destroy() on page unload here — see the comment on finishPaymentFlow() for why
  // it's called from there instead. That only covers a flow that actually finishes,
  // though: in a SPA where this widget can be unmounted before a terminal state is ever
  // reached (e.g. the user navigates away mid-flow), you'd still need an unmount-time
  // destroy() as a separate safety net — this static page has no such lifecycle to hang
  // one off.
}

const main = async (): Promise<void> => {
  try {
    await initGooglePayDemo()
  } catch (error) {
    console.error(error)

    const statusElement = document.querySelector<HTMLParagraphElement>('#status')

    if (statusElement) {
      statusElement.textContent = 'Something went wrong while loading the demo.'
    }
  }
}

main()
