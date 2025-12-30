import React from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StateProvider } from '../src/modules/StateManagerModule/StateProvider';
import { GestureHandlerComponent } from '../src/modules/GestureHandlerModule/GestureHandlerComponent';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StateProvider>
        <GestureHandlerComponent>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
          </Stack>
        </GestureHandlerComponent>
      </StateProvider>
    </GestureHandlerRootView>
  );
}