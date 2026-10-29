import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { colors } from '@/constants/theme';
import { WatchPromptProvider } from '@/components/WatchPrompt';
import { SyncProvider } from '@/store/sync';
import { TrackerProvider } from '@/store/tracker';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts(Ionicons.font);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <TrackerProvider>
      <SyncProvider>
        <WatchPromptProvider>
          <ThemeProvider value={theme}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.text,
                headerShadowVisible: false,
                headerBackButtonDisplayMode: 'minimal',
              }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Back' }} />
              <Stack.Screen name="show/[id]" options={{ title: '' }} />
              <Stack.Screen name="episode/[id]" options={{ title: '' }} />
              <Stack.Screen name="person/[id]" options={{ title: '' }} />
              <Stack.Screen name="account" options={{ title: 'Account & backup' }} />
            </Stack>
          </ThemeProvider>
        </WatchPromptProvider>
      </SyncProvider>
    </TrackerProvider>
  );
}
