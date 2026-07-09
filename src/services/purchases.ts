// RevenueCat Service
// When EXPO_PUBLIC_MOCK_PURCHASES=true or RevenueCat not configured, uses mock mode
// To enable real purchases:
// 1. npm install react-native-purchases
// 2. Set EXPO_PUBLIC_REVENUECAT_API_KEY_IOS and EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID
// 3. Set EXPO_PUBLIC_MOCK_PURCHASES=false
// 4. Build with expo-dev-client

import { Platform } from 'react-native';

export const ENTITLEMENT_ID = 'Rio Parana Pro';

// Configuration
const MOCK_MODE = process.env.EXPO_PUBLIC_MOCK_PURCHASES !== 'false';
const REVENUECAT_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS,
  android: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID,
});

let isInitialized = false;
let mockIsPremium = false;
let Purchases: any = null;

export async function initializePurchases(userId?: string): Promise<void> {
  if (isInitialized) {
    console.log('Purchases already initialized');
    return;
  }

  // Try to use real RevenueCat if configured
  if (!MOCK_MODE && REVENUECAT_API_KEY) {
    try {
      // Dynamic import to avoid crash when not installed
      const rcModule = await import('react-native-purchases');
      Purchases = rcModule.default;

      await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      if (userId) {
        await Purchases.logIn(userId);
      }
      console.log('✅ RevenueCat initialized');
      isInitialized = true;
      return;
    } catch (error) {
      console.warn('RevenueCat not available, falling back to mock mode:', error);
    }
  }

  console.log('✅ Purchases initialized (mock mode)');
  isInitialized = true;
}

export async function getCustomerInfo(): Promise<any> {
  if (Purchases) {
    return await Purchases.getCustomerInfo();
  }
  return {
    entitlements: {
      active: mockIsPremium ? { [ENTITLEMENT_ID]: { expirationDate: null } } : {},
    },
  };
}

export async function checkPremiumStatus(): Promise<boolean> {
  if (Purchases) {
    const customerInfo = await Purchases.getCustomerInfo();
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
    console.log('Premium status (RevenueCat):', isPremium);
    return isPremium;
  }
  console.log('Premium status (mock):', mockIsPremium);
  return mockIsPremium;
}

export async function getOfferings(): Promise<any> {
  if (Purchases) {
    return await Purchases.getOfferings();
  }
  // Mock offerings
  return {
    current: {
      identifier: 'default',
      monthly: {
        identifier: '$rc_monthly',
        product: {
          priceString: '$2.99',
          price: 2.99,
        },
      },
      availablePackages: [],
    },
  };
}

export async function purchasePackage(pkg: any): Promise<any> {
  if (Purchases) {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  }
  console.log('Purchase attempted (mock mode)');
  mockIsPremium = true;
  return getCustomerInfo();
}

export async function restorePurchases(): Promise<any> {
  if (Purchases) {
    return await Purchases.restorePurchases();
  }
  console.log('Restore attempted (mock mode)');
  return getCustomerInfo();
}

export async function identifyUser(userId: string): Promise<any> {
  if (Purchases) {
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo;
  }
  console.log('User identified (mock):', userId);
  return getCustomerInfo();
}

export async function logOutUser(): Promise<any> {
  if (Purchases) {
    return await Purchases.logOut();
  }
  console.log('User logged out (mock)');
  mockIsPremium = false;
  return getCustomerInfo();
}

export function addCustomerInfoUpdateListener(
  listener: (customerInfo: any) => void
): () => void {
  if (Purchases) {
    return Purchases.addCustomerInfoUpdateListener(listener);
  }
  // Mock listener - no-op
  return () => {};
}
