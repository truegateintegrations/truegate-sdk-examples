import { SDK_ENV, TRANSACTION_ID } from './config'
import { loadTruegateSdk } from './helpers/truegate-sdk-loader'
import type { CardPaymentResponse, SdkInstancePublic } from './types/vendors/truegate-sdk'

const CARD_NUMBER_ELEMENT_ID = 'card-number'
const CARD_EXPIRATION_ELEMENT_ID = 'card-expiration'
const CARD_SECURITY_CODE_ELEMENT_ID = 'card-cvv'
const APPLE_PAY_BUTTON_ELEMENT_ID = 'apple-pay-button'
const GOOGLE_PAY_BUTTON_ELEMENT_ID = 'google-pay-button'
const PAY_PAL_BUTTON_ELEMENT_ID = 'pay-pal-button'

interface PageElements {
  statusElement: HTMLParagraphElement
  cardForm: HTMLFormElement
  cardHolderNameInput: HTMLInputElement
  cardSubmitButton: HTMLButtonElement
  applePayButtonContainer: HTMLDivElement
  googlePayButtonContainer: HTMLDivElement
  payPalButtonContainer: HTMLDivElement
}

const getPageElements = (): PageElements => {
  const statusElement = document.querySelector<HTMLParagraphElement>('#status')
  const cardForm = document.querySelector<HTMLFormElement>('#card-payment-form')
  const cardHolderNameInput = document.querySelector<HTMLInputElement>('#card-holder-name')
  const cardSubmitButton = document.querySelector<HTMLButtonElement>('#submit-button')
  const applePayButtonContainer = document.querySelector<HTMLDivElement>(`#${APPLE_PAY_BUTTON_ELEMENT_ID}`)
  const googlePayButtonContainer = document.querySelector<HTMLDivElement>(`#${GOOGLE_PAY_BUTTON_ELEMENT_ID}`)
  const payPalButtonContainer = document.querySelector<HTMLDivElement>(`#${PAY_PAL_BUTTON_ELEMENT_ID}`)

  if (
    !statusElement ||
    !cardForm ||
    !cardHolderNameInput ||
    !cardSubmitButton ||
    !applePayButtonContainer ||
    !googlePayButtonContainer ||
    !payPalButtonContainer
  ) {
    throw new Error('All payment methods demo: required DOM elements are missing')
  }

  return {
    statusElement,
    cardForm,
    cardHolderNameInput,
    cardSubmitButton,
    applePayButtonContainer,
    googlePayButtonContainer,
    payPalButtonContainer,
  }
}

const setStatus = (elements: PageElements, text: string): void => {
  elements.statusElement.textContent = text
}

// Dims a wallet button and blocks clicks in place, without touching layout — a checkout
// page shouldn't visibly jump every time a button's state changes.
const setButtonEnabled = (container: HTMLElement, isEnabled: boolean): void => {
  container.classList.toggle('is-disabled', !isEnabled)
}

// Unlike setButtonEnabled, this removes the button from layout — for a method that was
// never available in the first place (disabled account-side, or not eligible on this
// browser/device), not for a temporary lock. The other methods' buttons shift up to fill
// the gap once, at setup, instead of everyone permanently keeping a dead slot reserved
// for a method that will never work here.
const hideButton = (container: HTMLElement): void => {
  container.classList.add('is-hidden')
}

const cardValidity = {
  isCardNumberValid: false,
  isExpirationValid: false,
  isSecurityCodeValid: false,
}

const isCardFormValid = (): boolean => {
  return cardValidity.isCardNumberValid && cardValidity.isExpirationValid && cardValidity.isSecurityCodeValid
}

// A `transactionId` is single-use for the whole transaction, not per payment method (see
// docs/prerequisites.md). If a formally valid attempt on ANY method reaches the backend
// and fails there, the transactionId is burned for every method on this page, not just
// the one that was tried. That's why there is exactly ONE flag here, shared by all four
// methods, instead of a separate "isSubmitted" per button — locking only the button that
// was clicked would leave the others sitting there looking like a valid "try a different
// way to pay" fallback, when they'd actually just fail the same way against the same
// dead transactionId.
let isTransactionConsumed = false

// The four methods initialize in parallel and don't all resolve at the same instant —
// a user can click a method that became ready early (setting its own status, e.g.
// "Opening Apple Pay…") while a slower method is still loading. Guards the generic
// "choose a method" status set once loading finishes from clobbering that.
let isUserStartedPaying = false

const updateCardSubmitButton = (elements: PageElements): void => {
  elements.cardSubmitButton.disabled = isTransactionConsumed || !isCardFormValid()
}

// Locks every method's button at once — used both the moment Card Payment starts a real
// submission (before its outcome is even known) and once any method's flow genuinely
// ends. Doesn't touch the SDK itself; see finishTransaction() below for that half.
const lockAllPaymentButtons = (elements: PageElements): void => {
  isTransactionConsumed = true
  updateCardSubmitButton(elements)
  setButtonEnabled(elements.applePayButtonContainer, false)
  setButtonEnabled(elements.googlePayButtonContainer, false)
  setButtonEnabled(elements.payPalButtonContainer, false)
}

const TERMINAL_PAYMENT_STATUSES = ['SUCCESS', 'FAILED']

type Channel = 'CARD_PAYMENT' | 'APPLE_PAY' | 'GOOGLE_PAY' | 'PAY_PAL'

const LABEL_BY_CHANNEL: Record<Channel, string> = {
  CARD_PAYMENT: 'Card',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
  PAY_PAL: 'PayPal',
}

const getChannelLabel = (channel: Channel): string => {
  return LABEL_BY_CHANNEL[channel]
}

// A payment flow ends one of two ways: a terminal PAYMENT_STATUS, or PAYMENT_ERROR
// firing on its own with no PAYMENT_STATUS to follow. Both must be handled — a
// merchant UI that only waits for a terminal status can hang forever after an error.
//
// destroy() belongs here, not on page unload: once the flow is over the transactionId
// is spent either way, so nothing meaningful can ever happen on this SDK instance again.
// One destroy() call is enough to stop every method at once, since all four share this
// single instance — but it's still not a substitute for lockAllPaymentButtons(): each
// injected button/widget is mounted independently of the SDK instance and stays
// clickable after destroy(), same as in every single-method example.
const finishTransaction = (sdk: SdkInstancePublic, elements: PageElements, reason: string): void => {
  console.log(`Truegate: payment flow finished — ${reason}`)
  lockAllPaymentButtons(elements)
  sdk.destroy()
}

// Subscribe to every event BEFORE calling init()/initCardPayment()/initApplePay()/
// initGooglePay()/initPayPal() — some of them can fire as soon as a form/button is
// injected.
const subscribeToSdkEvents = (sdk: SdkInstancePublic, elements: PageElements): void => {
  sdk.on('INIT_PAYMENTS_LOADING', () => {
    console.log('Truegate: initializing payment methods…')
  })

  sdk.on('INIT_PAYMENTS_ERROR', () => {
    setStatus(elements, 'Failed to initialize Truegate payments.')
  })

  subscribeToCardPaymentEvents(sdk, elements)
  subscribeToApplePayEvents(sdk, elements)
  subscribeToGooglePayEvents(sdk, elements)
  subscribeToPayPalEvents(sdk, elements)

  // --- Shared across all methods ---

  // Only ever fires for Apple Pay/Google Pay — Card Payment and PayPal don't have it.
  // It doesn't end the flow: the user dismissed the sheet before the SDK ever attempted
  // the transaction, so the transactionId is still unused. Re-enable just that one
  // method's button; the others were never touched in the first place.
  sdk.on('PAYMENT_CANCEL', (event) => {
    setStatus(elements, `${getChannelLabel(event.channel)}: cancelled. You can try again.`)

    switch (event.channel) {
      case 'APPLE_PAY': {
        setButtonEnabled(elements.applePayButtonContainer, true)

        return
      }
      case 'GOOGLE_PAY': {
        setButtonEnabled(elements.googlePayButtonContainer, true)

        return
      }
      default: {
        return
      }
    }
  })

  sdk.on('PAYMENT_ERROR', (event) => {
    setStatus(
      elements,
      `${getChannelLabel(event.channel)} payment failed. This transaction cannot be retried — request a new transactionId.`,
    )
    finishTransaction(sdk, elements, `PAYMENT_ERROR (${event.channel})`)
  })

  sdk.on('PAYMENT_STATUS', (event) => {
    setStatus(elements, `${getChannelLabel(event.channel)}: ${event.details.status}`)

    if (!TERMINAL_PAYMENT_STATUSES.includes(event.details.status)) {
      return
    }

    finishTransaction(sdk, elements, `PAYMENT_STATUS: ${event.details.status} (${event.channel})`)
  })
}

const subscribeToCardPaymentEvents = (sdk: SdkInstancePublic, elements: PageElements): void => {
  sdk.on('CARD_PAYMENT_DISABLED', () => {
    console.log('Truegate: card payment is disabled for this account.')
    elements.cardForm.hidden = true
  })

  sdk.on('INIT_CARD_PAYMENT_ERROR', () => {
    console.log('Truegate: failed to load the card payment form.')
    elements.cardForm.hidden = true
  })

  sdk.on('CARD_PAYMENT_READY', () => {
    console.log('Truegate: card form ready.')
  })

  sdk.on('CARD_NUMBER_VALIDATION_RESULT', (event) => {
    cardValidity.isCardNumberValid = event.details.isValid
    updateCardSubmitButton(elements)
  })

  sdk.on('CARD_NUMBER_VALIDATION_ERRORS', (event) => {
    console.log('Card number validation errors:', event.details.errors)
  })

  sdk.on('CARD_EXPIRATION_VALIDATION_RESULT', (event) => {
    cardValidity.isExpirationValid = event.details.isValid
    updateCardSubmitButton(elements)
  })

  sdk.on('CARD_EXPIRATION_VALIDATION_ERRORS', (event) => {
    console.log('Card expiration validation errors:', event.details.errors)
  })

  sdk.on('CARD_SECURITY_CODE_VALIDATION_RESULT', (event) => {
    cardValidity.isSecurityCodeValid = event.details.isValid
    updateCardSubmitButton(elements)
  })

  sdk.on('CARD_SECURITY_CODE_VALIDATION_ERRORS', (event) => {
    console.log('Card security code validation errors:', event.details.errors)
  })

  sdk.on('CARD_NUMBER_PROVIDER', (event) => {
    console.log('Detected card provider:', event.details.provider)
  })

  sdk.on('CARD_PAYMENT_CARD_DETAILS', (event) => {
    console.log('Card details:', event.details)
  })

  // Card Payment is the only method here where the SDK gives an explicit "now actually
  // talking to the backend" signal ahead of the final outcome — Apple Pay/Google Pay/
  // PayPal don't expose an equivalent, so their own buttons (below) can only lock
  // themselves individually at click time, not pre-emptively lock every other method.
  // From this point on the transactionId is genuinely at risk, so lock everything the
  // same as a real failure would — but don't destroy() yet, the outcome hasn't arrived.
  sdk.on('CARD_PAYMENT_SUBMIT', () => {
    isUserStartedPaying = true
    lockAllPaymentButtons(elements)
    setStatus(elements, 'Submitting card details…')
  })
}

const subscribeToApplePayEvents = (sdk: SdkInstancePublic, elements: PageElements): void => {
  sdk.on('APPLE_PAY_DISABLED', () => {
    console.log('Truegate: Apple Pay is not available.')
    hideButton(elements.applePayButtonContainer)
  })

  sdk.on('INIT_APPLE_PAY_ERROR', () => {
    console.log('Truegate: failed to load the Apple Pay button.')
    hideButton(elements.applePayButtonContainer)
  })

  sdk.on('APPLE_PAY_READY', () => {
    console.log('Truegate: Apple Pay ready.')
  })

  // Disables synchronously, before the sheet actually opens — see the apple-pay example
  // for why a fast double-click needs this. Only this one button locks; a click on Apple
  // Pay says nothing yet about whether the transactionId will end up consumed.
  sdk.on('APPLE_PAY_BUTTON_CLICK', () => {
    isUserStartedPaying = true
    setButtonEnabled(elements.applePayButtonContainer, false)
    setStatus(elements, 'Opening Apple Pay…')
  })
}

const subscribeToGooglePayEvents = (sdk: SdkInstancePublic, elements: PageElements): void => {
  sdk.on('GOOGLE_PAY_DISABLED', () => {
    console.log('Truegate: Google Pay is not available.')
    hideButton(elements.googlePayButtonContainer)
  })

  sdk.on('INIT_GOOGLE_PAY_ERROR', () => {
    console.log('Truegate: failed to load the Google Pay button.')
    hideButton(elements.googlePayButtonContainer)
  })

  sdk.on('GOOGLE_PAY_READY', () => {
    console.log('Truegate: Google Pay ready.')
  })

  // See the google-pay example for why this needs to happen synchronously, before the
  // sheet actually opens: a double-click here is reported as a genuine PAYMENT_ERROR,
  // not a cancellation.
  sdk.on('GOOGLE_PAY_BUTTON_CLICK', () => {
    isUserStartedPaying = true
    setButtonEnabled(elements.googlePayButtonContainer, false)
    setStatus(elements, 'Opening Google Pay…')
  })
}

const subscribeToPayPalEvents = (sdk: SdkInstancePublic, elements: PageElements): void => {
  sdk.on('PAY_PAL_DISABLED', () => {
    console.log('Truegate: PayPal is disabled for this account.')
    hideButton(elements.payPalButtonContainer)
  })

  sdk.on('INIT_PAY_PAL_ERROR', () => {
    console.log('Truegate: failed to load the PayPal button.')
    hideButton(elements.payPalButtonContainer)
  })

  sdk.on('PAY_PAL_READY', () => {
    console.log('Truegate: PayPal ready.')
  })

  sdk.on('PAY_PAL_BUTTON_CLICK', () => {
    isUserStartedPaying = true
    setStatus(elements, 'Opening PayPal…')
  })
}

const initCardPaymentForm = (elements: PageElements, submit: CardPaymentResponse['submit']): void => {
  elements.cardForm.addEventListener('submit', async (event) => {
    event.preventDefault()

    if (isTransactionConsumed) {
      return
    }

    if (!isCardFormValid()) {
      setStatus(elements, 'Please fix the highlighted fields before submitting.')

      return
    }

    try {
      await submit({ cardHolderName: elements.cardHolderNameInput.value })
    } catch (error) {
      console.error(error)

      // If isTransactionConsumed is still false, CARD_PAYMENT_SUBMIT never fired —
      // submit() rejected on its own argument check (INVALID_ARGUMENTS) before touching
      // the backend, so the transactionId is untouched and this form can be retried.
      if (!isTransactionConsumed) {
        setStatus(elements, 'Submission failed. Please check your input and try again.')

        return
      }

      setStatus(elements, 'Submission failed. This transaction cannot be retried — request a new transactionId.')
    }
  })
}

const initCardPaymentMethod = async (sdk: SdkInstancePublic, elements: PageElements): Promise<void> => {
  try {
    const { submit } = await sdk.initCardPayment({
      cardNumberId: CARD_NUMBER_ELEMENT_ID,
      expirationId: CARD_EXPIRATION_ELEMENT_ID,
      securityCodeId: CARD_SECURITY_CODE_ELEMENT_ID,
      options: {
        FONT_SIZE: '14px',
        PLACEHOLDER_CARD_NUMBER: 'Card number',
        PLACEHOLDER_EXPIRATION: 'MM / YY',
        PLACEHOLDER_SECURITY_CODE: 'CVC',
      },
    })
    initCardPaymentForm(elements, submit)
  } catch (error) {
    console.error(error)
  }
}

const initApplePayMethod = async (sdk: SdkInstancePublic): Promise<void> => {
  try {
    await sdk.initApplePay({
      id: APPLE_PAY_BUTTON_ELEMENT_ID,
      buttonOptions: { TYPE: 'PAY', THEME: 'BLACK', HEIGHT: '48px' },
    })
  } catch (error) {
    console.error(error)
  }
}

const initGooglePayMethod = async (sdk: SdkInstancePublic): Promise<void> => {
  try {
    await sdk.initGooglePay({
      id: GOOGLE_PAY_BUTTON_ELEMENT_ID,
      buttonOptions: { TYPE: 'BUY', THEME: 'BLACK', HEIGHT: '48px' },
    })
  } catch (error) {
    console.error(error)
  }
}

const initPayPalMethod = async (sdk: SdkInstancePublic): Promise<void> => {
  try {
    await sdk.initPayPal({
      id: PAY_PAL_BUTTON_ELEMENT_ID,
      buttonOptions: { HEIGHT: 48 },
    })
  } catch (error) {
    console.error(error)
  }
}

const initAllPaymentMethodsDemo = async (): Promise<void> => {
  const elements = getPageElements()

  setStatus(elements, 'Loading Truegate SDK…')

  const TruegateSdk = await loadTruegateSdk()

  const sdk = new TruegateSdk({
    id: 'all-payment-methods-demo',
    transactionId: TRANSACTION_ID,
    env: SDK_ENV,
  })

  subscribeToSdkEvents(sdk, elements)

  await sdk.init()

  // Each method is initialized independently, and its own failure is swallowed inside
  // init*Method() — the corresponding *_DISABLED/INIT_*_ERROR handler above already
  // hid that one button. One method being unavailable must never stop the others from
  // initializing; a real checkout page can't let Apple Pay being disabled take Card
  // Payment down with it.
  await Promise.all([
    initCardPaymentMethod(sdk, elements),
    initApplePayMethod(sdk),
    initGooglePayMethod(sdk),
    initPayPalMethod(sdk),
  ])

  if (!isUserStartedPaying) {
    setStatus(elements, "Choose how you'd like to pay.")
  }

  // No destroy() on page unload here — see the comment on finishTransaction() for why
  // it's called from there instead. That only covers a flow that actually finishes,
  // though: in a SPA where this widget can be unmounted before a terminal state is ever
  // reached (e.g. the user navigates away mid-flow), you'd still need an unmount-time
  // destroy() as a separate safety net — this static page has no such lifecycle to hang
  // one off.
}

const main = async (): Promise<void> => {
  try {
    await initAllPaymentMethodsDemo()
  } catch (error) {
    console.error(error)

    const statusElement = document.querySelector<HTMLParagraphElement>('#status')

    if (statusElement) {
      statusElement.textContent = 'Something went wrong while loading the demo.'
    }
  }
}

main()
