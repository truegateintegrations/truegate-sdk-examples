import { SDK_ENV, TRANSACTION_ID } from './config'
import { loadTruegateSdk } from './helpers/truegate-sdk-loader'
import type { SdkInstancePublic } from './types/vendors/truegate-sdk'

const APPLE_PAY_BUTTON_ELEMENT_ID = 'apple-pay-button'

interface PageElements {
  statusElement: HTMLParagraphElement
}

const getPageElements = (): PageElements => {
  const statusElement = document.querySelector<HTMLParagraphElement>('#status')

  if (!statusElement) {
    throw new Error('Apple Pay demo: required DOM elements are missing')
  }

  return { statusElement }
}

const setStatus = (elements: PageElements, text: string): void => {
  elements.statusElement.textContent = text
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
const finishPaymentFlow = (sdk: SdkInstancePublic, reason: string): void => {
  console.log(`Truegate: payment flow finished — ${reason}`)
  sdk.destroy()
}

// Subscribe to every event BEFORE calling init()/initApplePay() — some of them
// (e.g. APPLE_PAY_READY) can fire as soon as the button is injected.
const subscribeToSdkEvents = (sdk: SdkInstancePublic, elements: PageElements): void => {
  sdk.on('INIT_PAYMENTS_LOADING', () => {
    console.log('Truegate: initializing payment methods…')
  })

  sdk.on('INIT_PAYMENTS_ERROR', () => {
    setStatus(elements, 'Failed to initialize Truegate payments.')
  })

  // Covers two different situations the SDK doesn't distinguish between: Apple Pay
  // disabled for this merchant account, and Apple Pay unavailable in this browser/device
  // (it only renders in Safari on supporting Apple hardware). Either way, hide the button.
  sdk.on('APPLE_PAY_DISABLED', () => {
    setStatus(elements, 'Apple Pay is not available.')
  })

  sdk.on('INIT_APPLE_PAY_ERROR', () => {
    setStatus(elements, 'Failed to load the Apple Pay button.')
  })

  sdk.on('APPLE_PAY_READY', () => {
    setStatus(elements, 'Apple Pay ready — tap the button to pay.')
  })

  sdk.on('APPLE_PAY_BUTTON_CLICK', () => {
    setStatus(elements, 'Opening Apple Pay…')
  })

  sdk.on('PAYMENT_CANCEL', () => {
    setStatus(elements, 'Payment was cancelled.')
  })

  sdk.on('PAYMENT_ERROR', () => {
    setStatus(elements, 'Payment failed. This transaction cannot be retried — request a new transactionId.')
    finishPaymentFlow(sdk, 'PAYMENT_ERROR')
  })

  sdk.on('PAYMENT_STATUS', (event) => {
    setStatus(elements, `Payment status: ${event.details.status}`)

    if (!TERMINAL_PAYMENT_STATUSES.includes(event.details.status)) {
      return
    }

    finishPaymentFlow(sdk, `PAYMENT_STATUS: ${event.details.status}`)
  })
}

const initApplePayDemo = async (): Promise<void> => {
  const elements = getPageElements()

  setStatus(elements, 'Loading Truegate SDK…')

  const TruegateSdk = await loadTruegateSdk()

  const sdk = new TruegateSdk({
    id: 'apple-pay-demo',
    transactionId: TRANSACTION_ID,
    env: SDK_ENV,
  })

  subscribeToSdkEvents(sdk, elements)

  await sdk.init()

  // Unlike Card Payment, there's no separate submit() call to make — tapping the
  // injected button opens Apple's own payment sheet, and the SDK reports the outcome
  // through the PAYMENT_STATUS/PAYMENT_ERROR events subscribed to above.
  await sdk.initApplePay({
    id: APPLE_PAY_BUTTON_ELEMENT_ID,
    buttonOptions: {
      TYPE: 'PAY',
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
    await initApplePayDemo()
  } catch (error) {
    console.error(error)

    const statusElement = document.querySelector<HTMLParagraphElement>('#status')

    if (statusElement) {
      statusElement.textContent = 'Something went wrong while loading the demo.'
    }
  }
}

main()
