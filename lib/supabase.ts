import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Only the origin is valid: the "API URL" shown in some dashboard pages ends in /rest/v1/, which breaks auth.
const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const url = rawUrl ? rawUrl.replace(/^(https?:\/\/[^/]+).*$/, '$1') : rawUrl;
// Publishable key (sb_publishable_...). The legacy anon key also works.
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** null when the Supabase keys haven't been added to .env.local yet. */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // During static web rendering there is no window/localStorage.
          storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
