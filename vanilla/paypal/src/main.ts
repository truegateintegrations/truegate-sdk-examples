import { SDK_ENV, TRANSACTION_ID } from './config'
import { loadTruegateSdk } from './helpers/truegate-sdk-loader'
import type { SdkInstancePublic } from './types/vendors/truegate-sdk'

const PAY_PAL_BUTTON_ELEMENT_ID = 'pay-pal-button'

interface PageElements {
  statusElement: HTMLParagraphElement
  buttonContainer: HTMLDivElement
}

const getPageElements = (): PageElements => {
  const statusElement = document.querySelector<HTMLParagraphElement>('#status')
  const buttonContainer = document.querySelector<HTMLDivElement>(`#${PAY_PAL_BUTTON_ELEMENT_ID}`)

  if (!statusElement || !buttonContainer) {
    throw new Error('PayPal demo: required DOM elements are missing')
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
// Disabling the button matters just as much: PayPal's own Buttons widget is mounted
// independently of this SDK instance, so it stays clickable after destroy() — tapping
// it would still try to open a new order against a finished transactionId, with this
// SDK instance now deaf to whatever happens next.
const finishPaymentFlow = (sdk: SdkInstancePublic, elements: PageElements, reason: string): void => {
  console.log(`Truegate: payment flow finished — ${reason}`)
  sdk.destroy()
  setButtonEnabled(elements, false)
}

// Subscribe to every event BEFORE calling init()/initPayPal() — some of them (e.g.
// PAY_PAL_READY) can fire as soon as the button is injected.
const subscribeToSdkEvents = (sdk: SdkInstancePublic, elements: PageElements): void => {
  sdk.on('INIT_PAYMENTS_LOADING', () => {
    console.log('Truegate: initializing payment methods…')
  })

  sdk.on('INIT_PAYMENTS_ERROR', () => {
    setStatus(elements, 'Failed to initialize Truegate payments.')
  })

  // Means only one thing: PayPal isn't configured for this merchant account. Browser/
  // device ineligibility is a different case — it surfaces through INIT_PAY_PAL_ERROR
  // below, not this event.
  sdk.on('PAY_PAL_DISABLED', () => {
    setStatus(elements, 'PayPal is disabled for this account.')
  })

  // Covers both a genuine init failure and this browser/device not being eligible for
  // PayPal — the SDK doesn't split those two apart, so there's no way to tell them apart
  // from this event alone.
  sdk.on('INIT_PAY_PAL_ERROR', () => {
    setStatus(elements, 'Failed to load the PayPal button.')
  })

  sdk.on('PAY_PAL_READY', () => {
    setStatus(elements, 'PayPal ready — tap the button to pay.')
  })

  sdk.on('PAY_PAL_BUTTON_CLICK', () => {
    setStatus(elements, 'Opening PayPal…')
  })

  // Closing PayPal's popup without approving fires nothing on this SDK at all — there is
  // no cancel event. The widget resets itself and stays clickable either way, so don't
  // build UI logic that waits for a cancel signal here; it will never come.

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

const initPayPalDemo = async (): Promise<void> => {
  const elements = getPageElements()

  setStatus(elements, 'Loading Truegate SDK…')

  const TruegateSdk = await loadTruegateSdk()

  const sdk = new TruegateSdk({
    id: 'paypal-demo',
    transactionId: TRANSACTION_ID,
    env: SDK_ENV,
  })

  subscribeToSdkEvents(sdk, elements)

  await sdk.init()

  // Unlike Card Payment, there's no separate submit() call to make — tapping the
  // injected button opens PayPal's own checkout popup, and the SDK reports the outcome
  // through the PAYMENT_STATUS/PAYMENT_ERROR events subscribed to above.
  await sdk.initPayPal({
    id: PAY_PAL_BUTTON_ELEMENT_ID,
    buttonOptions: {
      HEIGHT: 48,
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
    await initPayPalDemo()
  } catch (error) {
    console.error(error)

    const statusElement = document.querySelector<HTMLParagraphElement>('#status')

    if (statusElement) {
      statusElement.textContent = 'Something went wrong while loading the demo.'
    }
  }
}

main()
