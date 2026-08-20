export const SHORT_HORIZON_DEPLOYABILITY_REGISTRY_VERSION = 'short-horizon-deployability-registry-v1';

export const OANDA_JAPAN_NY_PRO_REST_V1 = Object.freeze({
  schemaVersion:SHORT_HORIZON_DEPLOYABILITY_REGISTRY_VERSION,
  providerId:'oanda-japan-ny-pro-rest-v1',
  provider:{
    legalName:'OANDA証券株式会社',
    country:'JP',
    jurisdiction:'Japan',
    registration:{
      status:'REGISTERED_DOMESTIC_PROVIDER_REFERENCE',
      authority:'関東財務局',
      registrationNumber:'関東財務局長（金商）第2137号',
    },
  },
  product:{
    assetClass:'fx',
    researchInstrument:'USDJPY',
    providerInstrument:'USD_JPY',
    server:'NY',
    course:'pro',
    minimumOrderUnits:1,
    maximumOrderUnitsReference:3_000_000,
    publishedSpread:{
      valueSen:0.8,
      priceUnits:0.008,
      fixedInPrinciple:true,
      exceptionsApply:true,
      actualObservedSpread:false,
    },
  },
  api:{
    kind:'REST_V20_REFERENCE',
    japanOffering:'REST_API_ONLY',
    marketDataSupported:true,
    historicalCandlesSupported:true,
    candleGranularities:['M1','M5'],
    bidAskCandlesSupported:true,
    pricingStreamSupported:true,
    pricingStreamMaximumPricesPerSecondPerInstrumentReference:4,
    pricingStreamHeartbeatSecondsReference:5,
    providerOrderSubmissionSupported:true,
    supportedReferenceOrderTypes:['MARKET','LIMIT'],
    liveRestBaseUrl:'https://api-fxtrade.oanda.com',
    practiceRestBaseUrl:'https://api-fxpractice.oanda.com',
    liveStreamBaseUrl:'https://stream-fxtrade.oanda.com',
    practiceStreamBaseUrl:'https://stream-fxpractice.oanda.com',
    personalAccessTokenRequired:true,
    tokenStoredHere:false,
  },
  eligibility:{
    operatorEligibilityStatus:'UNVERIFIED',
    requiresLiveOandaJapanAccount:true,
    requiredMembershipStatus:'Gold or higher',
    requiredNyServerBalanceJpy:250_000,
    requiredCourse:'pro',
    apiAgreementRequired:true,
    programmingKnowledgeRequired:true,
    practiceApiStillRequiresLiveEligibility:true,
  },
  evidence:{
    verifiedAt:'2026-08-20',
    mutableProviderFacts:true,
    officialOnly:true,
    references:[
      'https://www.oanda.jp/company/disclosure',
      'https://www.oanda.jp/platform/api',
      'https://help.oanda.jp/oanda/faq/show/720?site_domain=default',
      'https://help.oanda.jp/oanda/faq/show/808?site_domain=default',
      'https://www.oanda.jp/fx/pro',
      'https://www.oanda.jp/account_type',
      'https://developer.oanda.com/rest-live-v20/development-guide/',
      'https://developer.oanda.com/rest-live-v20/pricing-ep/',
      'https://developer.oanda.com/rest-live-v20/instrument-df/',
      'https://developer.oanda.com/rest-live-v20/order-ep/',
    ],
  },
  governance:{
    referenceOnly:true,
    accountOwnershipVerified:false,
    apiEligibilityVerified:false,
    credentialsPresent:false,
    providerConnectionAttempted:false,
    executableQuoteObserved:false,
    providerCostBinding:false,
    executionAuthorized:false,
    realMoneyRouting:false,
    orderSubmission:false,
    profitabilityClaim:false,
  },
});

export const SHORT_HORIZON_DEPLOYABILITY_PROVIDERS = Object.freeze([
  OANDA_JAPAN_NY_PRO_REST_V1,
]);

export function getShortHorizonDeployabilityProvider(providerId) {
  const provider = SHORT_HORIZON_DEPLOYABILITY_PROVIDERS.find((item) => item.providerId === providerId);
  if (!provider) throw new Error(`short-horizon-deployability-provider-unknown:${providerId}`);
  validateShortHorizonDeployabilityProvider(provider);
  return provider;
}

export function validateShortHorizonDeployabilityProvider(record) {
  if (!record || record.schemaVersion !== SHORT_HORIZON_DEPLOYABILITY_REGISTRY_VERSION) {
    throw new Error('short-horizon-deployability-provider-version-invalid');
  }
  if (!record.providerId || !record.provider?.legalName) throw new Error('short-horizon-deployability-provider-id-invalid');
  if (record.provider?.country !== 'JP') throw new Error('short-horizon-deployability-provider-country-invalid');
  if (record.product?.assetClass !== 'fx' || record.product?.researchInstrument !== 'USDJPY') {
    throw new Error('short-horizon-deployability-provider-product-invalid');
  }
  if (!(Number(record.product?.publishedSpread?.priceUnits) > 0)) throw new Error('short-horizon-deployability-provider-spread-invalid');
  if (record.product?.publishedSpread?.actualObservedSpread !== false) throw new Error('short-horizon-deployability-provider-observed-spread-claim-invalid');
  if (record.eligibility?.operatorEligibilityStatus !== 'UNVERIFIED') throw new Error('short-horizon-deployability-provider-eligibility-must-be-unverified');
  if (record.api?.tokenStoredHere !== false || record.governance?.credentialsPresent !== false) {
    throw new Error('short-horizon-deployability-provider-secret-boundary-invalid');
  }
  if (
    record.governance?.referenceOnly !== true ||
    record.governance?.accountOwnershipVerified !== false ||
    record.governance?.apiEligibilityVerified !== false ||
    record.governance?.providerConnectionAttempted !== false ||
    record.governance?.executableQuoteObserved !== false ||
    record.governance?.providerCostBinding !== false ||
    record.governance?.executionAuthorized !== false ||
    record.governance?.realMoneyRouting !== false ||
    record.governance?.orderSubmission !== false ||
    record.governance?.profitabilityClaim !== false
  ) throw new Error('short-horizon-deployability-provider-governance-invalid');
  if (!record.evidence?.officialOnly || !record.evidence?.verifiedAt || !(record.evidence?.references?.length >= 4)) {
    throw new Error('short-horizon-deployability-provider-evidence-invalid');
  }
  return true;
}
