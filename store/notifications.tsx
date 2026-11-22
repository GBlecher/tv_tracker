import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useTracker } from '@/store/tracker';

const ENABLED_KEY = 'tvtracker:notifications:enabled:v1';
const DEVICE_ID_KEY = 'tvtracker:notifications:device-id:v1';
const CATEGORY_IDS = ['tvtracker-episode', 'tvtracker-show', 'tvtracker-shows'] as const;

type DeviceAction = 'sync' | 'open' | 'background' | 'heartbeat' | 'dismiss' | 'disable';
type NotificationStatus = 'loading' | 'disabled' | 'enabled' | 'unsupported' | 'error';

interface NotificationValue {
  enabled: boolean;
  status: NotificationStatus;
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

const NotificationContext = createContext<NotificationValue | null>(null);

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { data, ready } = useTracker();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<NotificationStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const enabledRef = useRef(false);
  const deviceId = useRef<string | null>(null);
  const expoPushToken = useRef<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const handledResponses = useRef(new Set<string>());
  const authUserId = useRef<string | null>(null);

  const getDeviceId = useCallback(async () => {
    if (deviceId.current) return deviceId.current;
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = Crypto.randomUUID();
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    deviceId.current = id;
    return id;
  }, []);

  const ensureSession = useCallback(async () => {
    if (!supabase) throw new Error('Episode notifications require Supabase setup.');
    const { data: current, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (current.session) return current.session;
    const { data: anonymous, error: anonymousError } = await supabase.auth.signInAnonymously();
    if (anonymousError) throw anonymousError;
    if (!anonymous.session) throw new Error('Could not create a device notification session.');
    return anonymous.session;
  }, []);

  const registerDevice = useCallback(
    async (action: DeviceAction) => {
      const client = supabase;
      if (!client) return;
      const request = queue.current.then(async () => {
        const session = await ensureSession();
        const id = await getDeviceId();
        let pushToken: string | undefined;
        if (action === 'sync') {
          if (!Device.isDevice) throw new Error('Push notifications require a physical iOS or Android device.');
          const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
          if (!projectId) throw new Error('Set up an EAS project ID before registering for push notifications.');
          const permissions = await Notifications.getPermissionsAsync();
          if (!permissions.granted) throw new Error('Notifications are not enabled for TV Tracker on this device.');
          expoPushToken.current ??= (await Notifications.getExpoPushTokenAsync({ projectId })).data;
          pushToken = expoPushToken.current;
        }

        const body = {
          action,
          deviceId: id,
          appActive: AppState.currentState === 'active',
          ...(pushToken ? { pushToken } : {}),
          ...(action === 'sync'
            ? {
                platform: Platform.OS,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                shows: Object.values(data.shows).map(({ id: showId, name, addedAt }) => ({
                  id: showId,
                  name,
                  addedAt,
                })),
                watchedEpisodeIds: Object.keys(data.watched).map(Number),
              }
            : {}),
        };
        const { error: invokeError } = await client.functions.invoke('notification-device', {
          body,
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (invokeError) throw invokeError;
        setError(null);
        if (enabledRef.current) setStatus('enabled');
      });
      queue.current = request.catch(() => {});
      return request;
    },
    [data, ensureSession, getDeviceId]
  );

  const dismissVisibleNotifications = useCallback(async () => {
    const visible = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      visible
        .filter((notification) => notification.request.content.data?.kind === 'tv-tracker-catchup')
        .map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier))
    );
  }, []);

  const acknowledgeAndNavigate = useCallback(
    async (response: Notifications.NotificationResponse) => {
      const payload = response.notification.request.content.data;
      if (payload?.kind !== 'tv-tracker-catchup') return;
      const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handledResponses.current.has(responseKey)) return;
      handledResponses.current.add(responseKey);

      if (
        response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
        response.actionIdentifier !== 'open'
      ) {
        await registerDevice('dismiss').catch((e) => {
          setError(e instanceof Error ? e.message : String(e));
        });
        await Notifications.clearLastNotificationResponseAsync();
        return;
      }

      await registerDevice('open').catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });
      await dismissVisibleNotifications().catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });
      const path = payload.path;
      if (typeof path === 'string' && (path === '/(tabs)' || /^\/(episode|show)\/\d+$/.test(path))) {
        router.navigate(path as Href);
      }
      await Notifications.clearLastNotificationResponseAsync();
    },
    [dismissVisibleNotifications, registerDevice]
  );

  const enable = useCallback(async () => {
    if (Platform.OS === 'web') {
      setStatus('unsupported');
      setError('Episode push notifications are currently available in the iOS and Android apps.');
      return;
    }
    if (!supabase) {
      setStatus('error');
      setError('Set up Supabase and the notification backend first.');
      return;
    }

    try {
      const permissions = await Notifications.getPermissionsAsync();
      const requested = permissions.granted ? permissions : await Notifications.requestPermissionsAsync();
      if (!requested.granted) {
        setStatus('disabled');
        setError('Allow notifications for TV Tracker in your device settings to enable episode alerts.');
        return;
      }
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('episodes', {
          name: 'Episode alerts',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: 'default',
        });
      }
      await Promise.all(
        CATEGORY_IDS.map((identifier, index) =>
          Notifications.setNotificationCategoryAsync(
            identifier,
            [
              {
                identifier: 'open',
                buttonTitle: ['Open episode', 'Catch up', 'View shows'][index],
              },
            ],
            { customDismissAction: true }
          )
        )
      );
      await ensureSession();
      await AsyncStorage.setItem(ENABLED_KEY, 'true');
      enabledRef.current = true;
      setEnabled(true);
      setStatus('enabled');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [ensureSession]);

  const disable = useCallback(async () => {
    try {
      await registerDevice('disable');
      await AsyncStorage.removeItem(ENABLED_KEY);
      enabledRef.current = false;
      expoPushToken.current = null;
      setEnabled(false);
      await dismissVisibleNotifications();
      setStatus('disabled');
      setError(null);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [dismissVisibleNotifications, registerDevice]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setStatus('unsupported');
      return;
    }
    AsyncStorage.getItem(ENABLED_KEY)
      .then((value) => {
        enabledRef.current = value === 'true';
        setEnabled(enabledRef.current);
        setStatus(enabledRef.current ? 'enabled' : 'disabled');
      })
      .catch((e) => {
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(() => {
    if (!enabledRef.current || !ready) return;
    const timer = setTimeout(() => {
      if (AppState.currentState === 'active') {
        dismissVisibleNotifications().catch((e) => {
          setError(e instanceof Error ? e.message : String(e));
        });
      }
      registerDevice('sync').catch((e) => {
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [data, dismissVisibleNotifications, ready, registerDevice, status]);

  useEffect(() => {
    if (!enabledRef.current) return;
    const subscription = AppState.addEventListener('change', (state) => {
      const action = state === 'active' ? 'open' : state === 'background' ? 'background' : null;
      if (!action) return;
      registerDevice(action).catch((e) => {
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      });
      if (action === 'open') dismissVisibleNotifications().catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });
    });
    const heartbeat = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      registerDevice('heartbeat').catch((e) => {
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      });
    }, 3 * 60 * 1000);
    return () => {
      subscription.remove();
      clearInterval(heartbeat);
    };
  }, [dismissVisibleNotifications, registerDevice, status]);

  useEffect(() => {
    const client = supabase;
    if (!enabled || !client) return;
    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null;
      if (authUserId.current === userId) return;
      authUserId.current = userId;
      setTimeout(() => {
        registerDevice('sync').catch((e) => {
          setStatus('error');
          setError(e instanceof Error ? e.message : String(e));
        });
      }, 0);
    });
    return () => authListener.subscription.unsubscribe();
  }, [enabled, registerDevice]);

  useEffect(() => {
    if (!enabledRef.current) return;
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      acknowledgeAndNavigate(response).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    });
    Notifications.getLastNotificationResponseAsync()
      .then((response) => response && acknowledgeAndNavigate(response))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => responseSubscription.remove();
  }, [acknowledgeAndNavigate, status]);

  const value = useMemo<NotificationValue>(
    () => ({ enabled, status, error, enable, disable }),
    [enabled, status, error, enable, disable]
  );
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider');
  return context;
}
