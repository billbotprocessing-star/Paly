import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../lib/theme';
import { AuthProvider } from '../lib/auth-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="new-goal" options={{ presentation: 'modal', title: 'New goal' }} />
          <Stack.Screen name="goal/[id]" options={{ title: 'Goal', headerBackTitle: 'Home' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
