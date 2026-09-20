import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../lib/auth-context';
import { colors, radii } from '../../lib/theme';

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{symbol}</Text>
  );
}

export default function TabsLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.lavenderDeep} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.lavenderDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarItemStyle: { borderRadius: radii.md },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon symbol="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="study"
        options={{
          title: 'Study',
          tabBarIcon: ({ focused }) => <TabIcon symbol="📘" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="buddy"
        options={{
          title: 'Buddy',
          tabBarIcon: ({ focused }) => <TabIcon symbol="☁️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    height: 68,
    borderRadius: 22,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
});
