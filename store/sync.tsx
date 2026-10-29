import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import { canonical, mergeData, normalizeData } from '@/lib/trackerData';
import { useTracker } from './tracker';

const TABLE = 'tracker_state';
const PUSH_DELAY = 1500;
const POLL_INTERVAL = 2 * 60 * 1000;

interface SyncValue {
  configured: boolean;
  session: Session | null;
  email: string | null;
  status: 'idle' | 'syncing' | 'error';
  error: string | null;
  lastSynced: Date | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves `true` when the user must confirm their email before signing in. */
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { data, ready, mergeIn } = useTracker();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncValue['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;
  const userId = session?.user.id ?? null;
  const lastSyncedJson = useRef<string | null>(null);
  const running = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const syncNow = useCallback(async () => {
    if (!supabase || !userId || !ready) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      do {
        again.current = false;
        const { data: row, error: pullErr } = await supabase.from(TABLE).select('data').eq('user_id', userId).maybeSingle();
        if (pullErr) throw pullErr;
        const remote = normalizeData(row?.data);
        const merged = mergeData(dataRef.current, remote);
        const mergedJson = canonical(merged);
        if (mergedJson !== canonical(dataRef.current)) mergeIn(remote);
        if (!row || mergedJson !== canonical(remote)) {
          const { error: pushErr } = await supabase
            .from(TABLE)
            .upsert({ user_id: userId, data: merged, updated_at: new Date().toISOString() });
          if (pushErr) throw pushErr;
        }
        lastSyncedJson.current = mergedJson;
      } while (again.current);
      setError(null);
      setStatus('idle');
      setLastSynced(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
      setStatus('error');
    } finally {
      running.current = false;
    }
  }, [userId, ready, mergeIn]);

  // Sync when signing in / opening the app, when it comes back to the foreground, and every few minutes.
  useEffect(() => {
    if (!userId || !ready) return;
    syncNow();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && syncNow());
    const timer = setInterval(syncNow, POLL_INTERVAL);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [userId, ready, syncNow]);

  // Push local changes shortly after they happen.
  useEffect(() => {
    if (!userId || !ready || canonical(data) === lastSyncedJson.current) return;
    const t = setTimeout(syncNow, PUSH_DELAY);
    return () => clearTimeout(t);
  }, [data, userId, ready, syncNow]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Cloud sync is not configured.');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Cloud sync is not configured.');
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw error;
    return !data.session;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    lastSyncedJson.current = null;
    setLastSynced(null);
    setError(null);
    setStatus('idle');
  }, []);

  const value = useMemo<SyncValue>(
    () => ({
      configured: !!supabase,
      session,
      email: session?.user.email ?? null,
      status,
      error,
      lastSynced,
      signIn,
      signUp,
      signOut,
      syncNow,
    }),
    [session, status, error, lastSynced, signIn, signUp, signOut, syncNow]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
