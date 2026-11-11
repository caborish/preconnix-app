import { LibreFranklin_400Regular, LibreFranklin_500Medium } from '@expo-google-fonts/libre-franklin';
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, Outfit_900Black } from '@expo-google-fonts/outfit';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, fonts } from '@/design/tokens';
import { DraftProvider } from '@/features/assessment/draft';
import { watchSignIn } from '@/features/onboarding/state';
import { onGoalReminderTapped } from '@/features/reminders/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Fonts are bundled from the npm packages at build time, never fetched from Google at runtime.
  const [loaded] = useFonts({
    LibreFranklin_400Regular,
    LibreFranklin_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Outfit_900Black
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  useEffect(watchSignIn, []);
  useEffect(() => onGoalReminderTapped(id => router.push(`/plan/goal/${id}` as never)), []);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <DraftProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.cream },
            headerShadowVisible: false,
            headerTintColor: colors.violetDark,
            headerTitleStyle: { fontFamily: fonts.label, color: colors.textPrimary },
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.cream }
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="name" options={{ headerShown: false }} />
          <Stack.Screen name="consent" options={{ title: '' }} />
          <Stack.Screen name="assess/profile" options={{ title: 'About you' }} />
          <Stack.Screen name="assess/section/[sectionId]" options={{ title: '' }} />
          <Stack.Screen name="assess/review" options={{ title: '', headerBackVisible: false, gestureEnabled: false }} />
          <Stack.Screen name="history/index" options={{ title: 'History' }} />
          <Stack.Screen name="history/[id]" options={{ title: 'Saved result' }} />
          <Stack.Screen name="settings/privacy" options={{ title: 'Privacy & sharing' }} />
          <Stack.Screen name="settings/notifications" options={{ title: '' }} />
          <Stack.Screen name="settings/security" options={{ title: '' }} />
          <Stack.Screen name="settings/data" options={{ title: '' }} />
          <Stack.Screen name="settings/health" options={{ title: '' }} />
          <Stack.Screen name="reminders/index" options={{ title: 'Reminders' }} />
          <Stack.Screen name="reminders/new" options={{ title: 'New reminder' }} />
          <Stack.Screen name="learn/[id]" options={{ title: 'Lesson' }} />
          <Stack.Screen name="plan/setup" options={{ title: '' }} />
          <Stack.Screen name="plan/essentials" options={{ title: '' }} />
          <Stack.Screen name="plan/generate" options={{ title: '' }} />
          <Stack.Screen name="plan/goal/new" options={{ title: '' }} />
          <Stack.Screen name="plan/goal/[id]" options={{ title: 'Goal' }} />
          <Stack.Screen name="circle/archive" options={{ title: 'Past weeks' }} />
          <Stack.Screen name="circle/guidelines" options={{ title: '' }} />
          <Stack.Screen name="circle/[id]" options={{ title: 'Circle' }} />
          <Stack.Screen name="results" options={{ title: 'Your results', headerBackVisible: false, gestureEnabled: false }} />
        </Stack>
      </DraftProvider>
    </SafeAreaProvider>
  );
}
