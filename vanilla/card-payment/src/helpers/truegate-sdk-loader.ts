import type { TruegateSdkConstructor } from '../types/vendors/truegate-sdk'
import { SDK_ENV, SDK_LOADING_MODE, SDK_SCRIPT_INTEGRITY, SDK_VERSION } from '../config'

declare global {
  interface Window {
    truegateSdk: TruegateSdkConstructor
  }
}

const SDK_ORIGIN_BY_ENV: Record<typeof SDK_ENV, string> = {
  TEST: 'https://sdk.test.truegate.tech',
  PROD: 'https://sdk.truegate.tech',
}

const hasVersionedIntegrity = Boolean(SDK_SCRIPT_INTEGRITY && SDK_VERSION)

const getSdkScriptPath = (): string => {
  if (hasVersionedIntegrity) {
    return `/${SDK_VERSION}/sdk.js`
  }

  return '/sdk.js'
}

const getSdkScriptUrl = (): string => {
  return `${SDK_ORIGIN_BY_ENV[SDK_ENV]}${getSdkScriptPath()}`
}

const waitForSdkReady = (): Promise<void> => {
  // Subscribe BEFORE injecting the <script> — SDK_READY fires only once.
  return new Promise((resolve) => {
    const handleMessage = (event: MessageEvent): void => {
      const isSdkReadyEvent = event.data?.scope === 'TRUEGATE_SDK' && event.data?.type === 'SDK_READY'

      if (!isSdkReadyEvent) {
        return
      }

      window.removeEventListener('message', handleMessage)
      resolve()
    }

    window.addEventListener('message', handleMessage)
  })
}

const loadViaScriptTag = async (): Promise<TruegateSdkConstructor> => {
  const readyPromise = waitForSdkReady()
  const script = document.createElement('script')

  script.src = getSdkScriptUrl()

  if (hasVersionedIntegrity) {
    script.integrity = `sha384-${SDK_SCRIPT_INTEGRITY}`
    script.crossOrigin = 'anonymous'
  }

  document.head.appendChild(script)
  await readyPromise

  return window.truegateSdk
}

const loadViaNpmImport = async (): Promise<TruegateSdkConstructor> => {
  const { TruegateSdk } = await import('@truegate/sdk-core')

  return TruegateSdk
}

export const loadTruegateSdk = async (): Promise<TruegateSdkConstructor> => {
  if (SDK_LOADING_MODE === 'SCRIPT') {
    return loadViaScriptTag()
  }

  return loadViaNpmImport()
}
