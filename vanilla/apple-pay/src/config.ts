export const SDK_LOADING_MODE: 'SCRIPT' | 'NPM' = 'SCRIPT' // how the SDK is loaded
export const SDK_ENV: 'TEST' | 'PROD' = 'TEST' // environment
export const TRANSACTION_ID = '<your_transaction_id>' // filled in by your backend

// Optional: SRI hash for script mode (see the SDK README, SRI section).
// When set, loads a versioned URL with integrity/crossorigin.
// Leave undefined if you don't need SRI (the common case).
export const SDK_SCRIPT_INTEGRITY: string | undefined = undefined
export const SDK_VERSION: string | undefined = undefined // required when SDK_SCRIPT_INTEGRITY is set
