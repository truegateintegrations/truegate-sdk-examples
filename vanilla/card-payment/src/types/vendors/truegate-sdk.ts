// Single entry point for the SDK's types. If the package gets renamed or a type
// needs a local patch, this is the only file to touch.
export type {
  TruegateSdkStaticPublic as TruegateSdkConstructor,
  SdkPayloadPublic,
  SdkInstancePublic,
  CardPaymentPayloadPublic,
  CardPaymentResponse,
  CardPaymentSubmitPayload,
} from '@truegate/sdk-core'
