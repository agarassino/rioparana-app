import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  initializePurchases,
  getCustomerInfo,
  getOfferings,
  purchasePackage,
  restorePurchases,
  addCustomerInfoUpdateListener,
  ENTITLEMENT_ID,
} from '../services/purchases';

interface PurchaseContextType {
  // Estado
  isInitialized: boolean;
  isLoading: boolean;
  isPremium: boolean;
  customerInfo: any | null;
  offerings: any | null;
  error: string | null;

  // Acciones
  purchase: (pkg: any) => Promise<boolean>;
  restore: () => Promise<boolean>;
  refreshCustomerInfo: () => Promise<void>;
}

const PurchaseContext = createContext<PurchaseContextType | undefined>(undefined);

interface PurchaseProviderProps {
  children: ReactNode;
}

export function PurchaseProvider({ children }: PurchaseProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<any | null>(null);
  const [offerings, setOfferings] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Actualiza el estado premium basado en customerInfo
  const updatePremiumStatus = useCallback((info: any) => {
    const hasPremium = info?.entitlements?.active?.[ENTITLEMENT_ID] !== undefined;
    setIsPremium(hasPremium);
    setCustomerInfo(info);
  }, []);

  // Inicializar al montar
  useEffect(() => {
    async function init() {
      try {
        setIsLoading(true);
        setError(null);

        // Inicializar SDK
        await initializePurchases();
        setIsInitialized(true);

        // Obtener info del cliente
        const info = await getCustomerInfo();
        updatePremiumStatus(info);

        // Obtener offerings
        const offeringsData = await getOfferings();
        setOfferings(offeringsData);

      } catch (err: any) {
        console.error('Failed to initialize purchases:', err);
        setError(err.message || 'Error inicializando compras');
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [updatePremiumStatus]);

  // Escuchar cambios en customerInfo
  useEffect(() => {
    if (!isInitialized) return;

    const unsubscribe = addCustomerInfoUpdateListener((info) => {
      console.log('Customer info updated');
      updatePremiumStatus(info);
    });

    return unsubscribe;
  }, [isInitialized, updatePremiumStatus]);

  // Realizar compra
  const purchase = useCallback(async (pkg: any): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const info = await purchasePackage(pkg);

      if (info) {
        updatePremiumStatus(info);
        return info?.entitlements?.active?.[ENTITLEMENT_ID] !== undefined;
      }

      return false;
    } catch (err: any) {
      console.error('Purchase failed:', err);
      setError(err.message || 'Error en la compra');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [updatePremiumStatus]);

  // Restaurar compras
  const restore = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const info = await restorePurchases();
      updatePremiumStatus(info);

      return info?.entitlements?.active?.[ENTITLEMENT_ID] !== undefined;
    } catch (err: any) {
      console.error('Restore failed:', err);
      setError(err.message || 'Error restaurando compras');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [updatePremiumStatus]);

  // Refrescar info del cliente
  const refreshCustomerInfo = useCallback(async (): Promise<void> => {
    try {
      const info = await getCustomerInfo();
      updatePremiumStatus(info);
    } catch (err: any) {
      console.error('Failed to refresh customer info:', err);
    }
  }, [updatePremiumStatus]);

  const value: PurchaseContextType = {
    isInitialized,
    isLoading,
    isPremium,
    customerInfo,
    offerings,
    error,
    purchase,
    restore,
    refreshCustomerInfo,
  };

  return (
    <PurchaseContext.Provider value={value}>
      {children}
    </PurchaseContext.Provider>
  );
}

export function usePurchaseContext(): PurchaseContextType {
  const context = useContext(PurchaseContext);

  if (context === undefined) {
    throw new Error('usePurchaseContext must be used within a PurchaseProvider');
  }

  return context;
}
