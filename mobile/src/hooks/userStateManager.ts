/**
 * 状态管理Hook
 * 位置：mobile/src/modules/StateManagerModule/hooks/useStateManager.ts
 */

import { useState, useEffect, useCallback } from 'react';
import { stateManagerModule, AppState, StateAction } from '../modules/StateManagerModule';

/**
 * 使用状态管理器的Hook
 */
export const useStateManager = () => {
  const [state, setState] = useState<AppState>(stateManagerModule.getState());

  useEffect(() => {
    // 订阅状态变更
    const unsubscribe = stateManagerModule.subscribeToChanges((newState: AppState, action: StateAction) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  const dispatch = useCallback((action: StateAction) => {
    stateManagerModule.dispatch(action);
  }, []);

  const setTriggerEnabled = useCallback((enabled: boolean) => {
    stateManagerModule.setTriggerEnabled(enabled);
  }, []);

  const setProcessingState = useCallback((processing: boolean, sessionId?: string) => {
    stateManagerModule.setProcessingState(processing, sessionId);
  }, []);

  const updatePreferences = useCallback((preferences: Partial<AppState['preferences']>) => {
    stateManagerModule.updatePreferences(preferences);
  }, []);

  return {
    state,
    dispatch,
    setTriggerEnabled,
    setProcessingState,
    updatePreferences,
    isTriggerEnabled: stateManagerModule.isTriggerEnabled.bind(stateManagerModule),
    isProcessing: stateManagerModule.isProcessing.bind(stateManagerModule),
    getConnectionStatus: stateManagerModule.getConnectionStatus.bind(stateManagerModule),
    getModuleStatus: stateManagerModule.getModuleStatus.bind(stateManagerModule),
    getSystemHealth: stateManagerModule.getSystemHealth.bind(stateManagerModule)
  };
};

/**
 * 使用特定状态的Hook
 */
export const useAppState = <T extends keyof AppState>(key: T): AppState[T] => {
  const [value, setValue] = useState<AppState[T]>(stateManagerModule.getState()[key]);

  useEffect(() => {
    const unsubscribe = stateManagerModule.subscribeToChanges((newState: AppState) => {
      if (newState[key] !== value) {
        setValue(newState[key]);
      }
    });

    return unsubscribe;
  }, [key, value]);

  return value;
};