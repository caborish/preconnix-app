// Five tabs, in the design handoff's order: Home, Plan, Learn, Circle, Account. Each tab draws its own small
// logo header (TabHeader), so the navigation header is hidden. The active tab shows a light violet capsule.
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/design/Icon';
import { colors, fonts } from '@/design/tokens';

const icon = (name: IconName) => ({ focused }: { focused: boolean }) => (
  <View style={[styles.capsule, focused && styles.capsuleOn]}>
    <Icon name={name} size={22} color={focused ? colors.violetDark : colors.textSecondary} />
  </View>
);

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.violetDark,
        tabBarInactiveTintColor: colors.textSecondary,
        // 64 above the phone's bottom inset (design handoff), so the capsule and label both fit.
        tabBarStyle: { backgroundColor: colors.cream, borderTopColor: colors.border, height: 64 + insets.bottom, paddingBottom: insets.bottom },
        tabBarItemStyle: { paddingTop: 6, paddingBottom: 6 },
        tabBarLabelStyle: { fontFamily: fonts.label, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.cream }
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: icon('plan') }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: icon('learn') }} />
      <Tabs.Screen name="circle" options={{ title: 'Circle', tabBarIcon: icon('circle') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('account') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  capsule: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  capsuleOn: { backgroundColor: colors.violetWash }
});
