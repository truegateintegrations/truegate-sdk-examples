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

const validity = {
  isCardNumberValid: false,
  isExpirationValid: false,
  isSecurityCodeValid: false,
}

// Truegate does not allow resubmitting the same transactionId once the request
// reaches the backend and gets rejected there (wrong CVV, declined card, etc.).
// Once a valid submit() attempt has been made, the submit button must stay
// disabled forever; a failed payment needs a brand new transactionId from your
// backend, not a retry click.
let isSubmitted = false

const isFormValid = (): boolean => {
  return validity.isCardNumberValid && validity.isExpirationValid && validity.isSecurityCodeValid
}

// Subscribe to every event BEFORE calling init()/initCardPayment() — some of
// them (e.g. validation results) can fire immediately once the form loads.
const subscribeToSdkEvents = (sdk: SdkInstancePublic, elements: FormElements): void => {
  const setStatus = (text: string): void => {
    elements.statusElement.textContent = text
  }

  const updateSubmitButton = (): void => {
    elements.submitButton.disabled = isSubmitted || !isFormValid()
  }

  sdk.on('INIT_PAYMENTS_LOADING', () => {
    console.log('Truegate: initializing payment methods…')
  })

  sdk.on('INIT_PAYMENTS_ERROR', () => {
    setStatus('Failed to initialize Truegate payments.')
  })

  sdk.on('CARD_PAYMENT_DISABLED', () => {
    setStatus('Card payment is disabled for this account.')
  })

  sdk.on('INIT_CARD_PAYMENT_ERROR', () => {
    setStatus('Failed to load the card payment form.')
  })

  sdk.on('CARD_PAYMENT_READY', () => {
    setStatus('Card form ready — fill in the details.')
  })

  sdk.on('CARD_NUMBER_VALIDATION_RESULT', (event) => {
    validity.isCardNumberValid = event.details.isValid
    updateSubmitButton()
  })

  sdk.on('CARD_EXPIRATION_VALIDATION_RESULT', (event) => {
    validity.isExpirationValid = event.details.isValid
    updateSubmitButton()
  })

  sdk.on('CARD_SECURITY_CODE_VALIDATION_RESULT', (event) => {
    validity.isSecurityCodeValid = event.details.isValid
    updateSubmitButton()
  })

  sdk.on('CARD_NUMBER_PROVIDER', (event) => {
    console.log('Detected card provider:', event.details.provider)
  })

  sdk.on('CARD_PAYMENT_CARD_DETAILS', (event) => {
    console.log('Card details:', event.details)
  })

  sdk.on('PAYMENT_CANCEL', () => {
    setStatus('Payment was cancelled.')
  })

  sdk.on('PAYMENT_ERROR', () => {
    setStatus('Payment failed. This transaction cannot be retried — request a new transactionId.')
  })

  sdk.on('PAYMENT_STATUS', (event) => {
    setStatus(`Payment status: ${event.details.status}`)
  })
}

const initCardPaymentForm = (elements: FormElements, submit: CardPaymentResponse['submit']): void => {
  const setStatus = (text: string): void => {
    elements.statusElement.textContent = text
  }

  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault()

    if (isSubmitted) {
      return
    }

    if (!isFormValid()) {
      setStatus('Please fix the highlighted fields before submitting.')

      return
    }

    // Lock the button before the async call, not after — a second click queued
    // while submit() is in flight must never reach the SDK.
    isSubmitted = true
    elements.submitButton.disabled = true
    setStatus('Submitting…')

    try {
      await submit({ cardHolderName: elements.cardHolderNameInput.value })
    } catch (error) {
      console.error(error)
      setStatus('Submission failed. This transaction cannot be retried — request a new transactionId.')
    }
  })
}

const main = async (): Promise<void> => {
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

main().catch((error) => {
  console.error(error)

  const statusElement = document.querySelector<HTMLParagraphElement>('#status')

  if (statusElement) {
    statusElement.textContent = 'Something went wrong while loading the demo.'
  }
})
