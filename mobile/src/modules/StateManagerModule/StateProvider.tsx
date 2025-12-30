/**
 * StateProvider React 组件
 * 位置：mobile/src/modules/StateManagerModule/StateProvider.tsx
 */

import React, { useReducer, useEffect, useContext } from 'react';
import { StateManagerModule, StateContext, StateContextValue, AppState, StateAction, defaultState } from './StateManagerModule';

// React Context Provider组件
export const StateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const stateManager = StateManagerModule.getInstance();
  
  // 使用 StateManagerModule 的状态作为 React state 的源
  const [state, setState] = React.useState<AppState>(() => stateManager.getState());

  // 初始化状态管理器
  useEffect(() => {
    stateManager.initialize();
    
    // 同步初始状态
    setState(stateManager.getState());
  }, []);

  // 订阅 StateManagerModule 的状态变化，同步到 React state
  useEffect(() => {
    const unsubscribe = stateManager.subscribeToChanges((newState) => {
      // 当 StateManagerModule 的状态变化时，更新 React state
      setState(newState);
    });

    return () => {
      unsubscribe();
    };
  }, [stateManager]);

  // React dispatch 函数：更新 StateManagerModule，它会自动通知订阅者（包括这个组件）
  const reactDispatch = React.useCallback((action: StateAction) => {
    stateManager.dispatch(action);
    // StateManagerModule 的 dispatch 会触发 subscribeToChanges 回调
    // 从而更新 React state，所以这里不需要手动调用 setState
  }, [stateManager]);

  const value: StateContextValue = {
    state,
    dispatch: reactDispatch,
    persistState: (keys?: (keyof AppState)[]) => stateManager.persistState(keys),
    restoreState: () => stateManager.restoreState(),
    resetToDefaults: () => stateManager.resetToDefaults(),
    getStateSnapshot: () => stateManager.getStateSnapshot(),
    subscribeToChanges: (callback: (state: AppState, action: StateAction) => void) => stateManager.subscribeToChanges(callback)
  };

  return (
    <StateContext.Provider value={value}>
      {children}
    </StateContext.Provider>
  );
};

// 自定义Hook用于访问状态
export const useStateContext = (): StateContextValue => {
  const context = useContext(StateContext);
  if (!context) {
    throw new Error('useStateContext必须在StateProvider内部使用');
  }
  return context;
};

