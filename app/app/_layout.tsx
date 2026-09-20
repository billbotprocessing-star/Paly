import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../lib/theme';
import { ScrapsProvider } from '../lib/scraps-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ScrapsProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="new-scrap"
            options={{ presentation: 'modal', title: 'New scrap' }}
          />
          <Stack.Screen
            name="scrap/[id]"
            options={{ title: 'Clarify', headerBackTitle: 'Home' }}
          />
        </Stack>
      </ScrapsProvider>
    </SafeAreaProvider>
  );
}
