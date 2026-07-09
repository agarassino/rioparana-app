import { usePurchaseContext } from '../context/PurchaseContext';

/**
 * Hook para acceder al estado de compras y suscripciones
 */
export function usePurchases() {
  const context = usePurchaseContext();

  return {
    // Estado
    isPremium: context.isPremium,
    isLoading: context.isLoading,
    isInitialized: context.isInitialized,
    customerInfo: context.customerInfo,
    offerings: context.offerings,
    error: context.error,

    // Paquetes disponibles (shortcuts)
    monthlyPackage: context.offerings?.current?.monthly ?? null,
    annualPackage: context.offerings?.current?.annual ?? null,
    allPackages: context.offerings?.current?.availablePackages ?? [],

    // Acciones
    purchase: context.purchase,
    restore: context.restore,
    refreshCustomerInfo: context.refreshCustomerInfo,
  };
}

/**
 * Hook para verificar si una feature está disponible
 */
export function useFeatureAccess(featureRequiresPremium: boolean = true): boolean {
  const { isPremium } = usePurchases();

  if (!featureRequiresPremium) return true;

  return isPremium;
}
