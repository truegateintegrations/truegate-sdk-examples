import { SDK_ENV, TRANSACTION_ID } from './config'
import { loadTruegateSdk } from './helpers/truegate-sdk-loader'
import type { CardPaymentResponse, SdkInstancePublic } from './types/vendors/truegate-sdk'

const CARD_NUMBER_ELEMENT_ID = 'card-number'
const CARD_EXPIRATION_ELEMENT_ID = 'card-expiration'
const CARD_SECURITY_CODE_ELEMENT_ID = 'card-cvv'

interface FormElements {
  form: HTMLFormElement
  cardHolderNameInput: HTMLInputElement
  submitButton: HTMLButtonElement
  statusElement: HTMLParagraphElement
}

const getFormElements = (): FormElements => {
  const form = document.querySelector<HTMLFormElement>('#card-payment-form')
  const cardHolderNameInput = document.querySelector<HTMLInputElement>('#card-holder-name')
  const submitButton = document.querySelector<HTMLButtonElement>('#submit-button')
  const statusElement = document.querySelector<HTMLParagraphElement>('#status')

  if (!form || !cardHolderNameInput || !submitButton || !statusElement) {
    throw new Error('Card payment demo: required DOM elements are missing')
  }

  return { form, cardHolderNameInput, submitButton, statusElement }
}

const setStatus = (elements: FormElements, text: string): void => {
  elements.statusElement.textContent = text
}

const validity = {
  isCardNumberValid: false,
  isExpirationValid: false,
  isSecurityCodeValid: false,
}

// Truegate does not allow resubmitting the same transactionId once a submit()
// attempt actually reaches the backend and gets rejected there (wrong CVV,
// declined card, etc.) — once that happens, the submit button must stay
// disabled forever; a failed payment needs a brand new transactionId, not a
// retry click.
//
// A missing/invalid `cardHolderName` is a different case: submit() rejects
// with INVALID_ARGUMENTS synchronously, before it ever emits CARD_PAYMENT_SUBMIT
// or talks to the backend, so the transactionId is still unused. That's why this
// flag is set from the CARD_PAYMENT_SUBMIT event below, not from calling submit()
// — CARD_PAYMENT_SUBMIT only fires once the SDK has actually started sending data.
let isSubmitted = false

const isFormValid = (): boolean => {
  return validity.isCardNumberValid && validity.isExpirationValid && validity.isSecurityCodeValid
}

const updateSubmitButton = (elements: FormElements): void => {
  elements.submitButton.disabled = isSubmitted || !isFormValid()
}

// The only statuses that end a payment flow — everything else on PAYMENT_STATUS
// (e.g. PENDING) just means "still in progress".
const TERMINAL_PAYMENT_STATUSES = ['SUCCESS', 'FAILED']

// A payment flow ends one of two ways: a non-pending PAYMENT_STATUS, or PAYMENT_ERROR.
// Both must be handled — PAYMENT_ERROR does not come with a follow-up PAYMENT_STATUS,
// so a merchant UI that only waits for a terminal status can hang forever after an
// error. In a real integration this is where you'd close the checkout modal, redirect
// back to your order page, stop polling your own backend, etc.
const finishPaymentFlow = (reason: string): void => {
  console.log(`Truegate: payment flow finished — ${reason}`)
}

// Subscribe to every event BEFORE calling init()/initCardPayment() — some of
// them (e.g. validation results) can fire immediately once the form loads.
const subscribeToSdkEvents = (sdk: SdkInstancePublic, elements: FormElements): void => {
  sdk.on('INIT_PAYMENTS_LOADING', () => {
    console.log('Truegate: initializing payment methods…')
  })

  sdk.on('INIT_PAYMENTS_ERROR', () => {
    setStatus(elements, 'Failed to initialize Truegate payments.')
  })

  sdk.on('CARD_PAYMENT_DISABLED', () => {
    setStatus(elements, 'Card payment is disabled for this account.')
  })

  sdk.on('INIT_CARD_PAYMENT_ERROR', () => {
    setStatus(elements, 'Failed to load the card payment form.')
  })

  sdk.on('CARD_PAYMENT_READY', () => {
    setStatus(elements, 'Card form ready — fill in the details.')
  })

  sdk.on('CARD_NUMBER_VALIDATION_RESULT', (event) => {
    validity.isCardNumberValid = event.details.isValid
    updateSubmitButton(elements)
  })

  // *_VALIDATION_ERRORS carries the reason(s) behind an invalid field — use it to
  // show a real message next to the field instead of just disabling the submit button.
  sdk.on('CARD_NUMBER_VALIDATION_ERRORS', (event) => {
    console.log('Card number validation errors:', event.details.errors)
  })

  sdk.on('CARD_EXPIRATION_VALIDATION_RESULT', (event) => {
    validity.isExpirationValid = event.details.isValid
    updateSubmitButton(elements)
  })

  sdk.on('CARD_EXPIRATION_VALIDATION_ERRORS', (event) => {
    console.log('Card expiration validation errors:', event.details.errors)
  })

  sdk.on('CARD_SECURITY_CODE_VALIDATION_RESULT', (event) => {
    validity.isSecurityCodeValid = event.details.isValid
    updateSubmitButton(elements)
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

  // Fires once submit() has passed its own argument checks and actually started
  // sending data — see the comment on `isSubmitted` above for why the lock lives here.
  sdk.on('CARD_PAYMENT_SUBMIT', () => {
    isSubmitted = true
    updateSubmitButton(elements)
    setStatus(elements, 'Submitting…')
  })

  sdk.on('PAYMENT_CANCEL', () => {
    setStatus(elements, 'Payment was cancelled.')
  })

  sdk.on('PAYMENT_ERROR', () => {
    setStatus(elements, 'Payment failed. This transaction cannot be retried — request a new transactionId.')
    finishPaymentFlow('PAYMENT_ERROR')
  })

  sdk.on('PAYMENT_STATUS', (event) => {
    setStatus(elements, `Payment status: ${event.details.status}`)

    if (!TERMINAL_PAYMENT_STATUSES.includes(event.details.status)) {
      return
    }

    finishPaymentFlow(`PAYMENT_STATUS: ${event.details.status}`)
  })
}

const initCardPaymentForm = (elements: FormElements, submit: CardPaymentResponse['submit']): void => {
  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault()

    if (isSubmitted) {
      return
    }

    if (!isFormValid()) {
      setStatus(elements, 'Please fix the highlighted fields before submitting.')

      return
    }

    try {
      await submit({ cardHolderName: elements.cardHolderNameInput.value })
    } catch (error) {
      console.error(error)

      // If isSubmitted is still false, CARD_PAYMENT_SUBMIT never fired — submit()
      // rejected on its own argument check (INVALID_ARGUMENTS) before touching the
      // backend, so the transactionId is untouched and this form can be retried.
      if (!isSubmitted) {
        setStatus(elements, 'Submission failed. Please check your input and try again.')

        return
      }

      setStatus(elements, 'Submission failed. This transaction cannot be retried — request a new transactionId.')
    }
  })
}

const initCardPaymentDemo = async (): Promise<void> => {
  const elements = getFormElements()

  elements.statusElement.textContent = 'Loading Truegate SDK…'

  const TruegateSdk = await loadTruegateSdk()

  const sdk = new TruegateSdk({
    id: 'card-payment-demo',
    transactionId: TRANSACTION_ID,
    env: SDK_ENV,
  })

  subscribeToSdkEvents(sdk, elements)

  await sdk.init()

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

  // Best practice: release the SDK's internal listeners once the page is gone.
  window.addEventListener('beforeunload', () => {
    sdk.destroy()
  })
}

const main = async (): Promise<void> => {
  try {
    await initCardPaymentDemo()
  } catch (error) {
    console.error(error)

    const statusElement = document.querySelector<HTMLParagraphElement>('#status')

    if (statusElement) {
      statusElement.textContent = 'Something went wrong while loading the demo.'
    }
  }
}

main()
