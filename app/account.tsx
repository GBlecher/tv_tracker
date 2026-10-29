import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, SectionHeader } from '@/components/ui';
import { colors, radius } from '@/constants/theme';
import { exportBackup, pickBackup } from '@/lib/backup';
import { useSync } from '@/store/sync';
import { useTracker } from '@/store/tracker';

function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function ask(title: string, message: string, okText: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: okText, onPress: () => resolve(true) },
    ])
  );
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function AccountScreen() {
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <SectionHeader title="Account & sync" />
      <SyncSection />
      <SectionHeader title="Backup & restore" />
      <BackupSection />
    </ScrollView>
  );
}

function SyncSection() {
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  if (!sync.configured) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Cloud sync is not set up</Text>
        <Text style={styles.muted}>
          Add your Supabase Project URL and publishable key to the .env.local file (see .env.example and the README), then restart
          the app. Until then you can still move your data with a backup file below.
        </Text>
      </View>
    );
  }

  if (sync.session) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>Signed in as</Text>
        <Text style={styles.title}>{sync.email}</Text>
        <View style={styles.statusRow}>
          {sync.status === 'syncing' ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <View style={[styles.dot, { backgroundColor: sync.status === 'error' ? colors.danger : colors.success }]} />
          )}
          <Text style={styles.muted}>
            {sync.status === 'syncing'
              ? 'Syncing…'
              : sync.status === 'error'
                ? `Sync failed: ${sync.error}`
                : sync.lastSynced
                  ? `Synced at ${sync.lastSynced.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : 'Waiting to sync'}
          </Text>
        </View>
        <Text style={styles.muted}>
          Your shows and watched episodes sync automatically. Sign in with the same account on another device to get
          them there.
        </Text>
        <Button title="Sync now" icon="sync" onPress={sync.syncNow} disabled={sync.status === 'syncing'} />
        <Button title="Sign out" icon="log-out-outline" variant="secondary" onPress={sync.signOut} />
      </View>
    );
  }

  const switchMode = (m: 'in' | 'up') => {
    setMode(m);
    setConfirm('');
    setMessage(null);
  };

  const run = async () => {
    if (!email.trim() || !password) {
      setMessage({ text: 'Enter your email and a password.', error: true });
      return;
    }
    if (mode === 'up' && password !== confirm) {
      setMessage({ text: 'Passwords do not match.', error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'in') await sync.signIn(email, password);
      else {
        const needsConfirm = await sync.signUp(email, password);
        if (needsConfirm) {
          switchMode('in');
          setMessage({ text: 'Account created. Check your email to confirm it, then sign in here.' });
        }
      }
    } catch (e) {
      setMessage({ text: errMsg(e), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{mode === 'in' ? 'Sign in' : 'Create account'}</Text>
      <Text style={styles.muted}>
        {mode === 'in'
          ? 'Sign in to back up your shows and watched episodes to the cloud and keep them in sync across your devices.'
          : 'Create an account to back up your shows and watched episodes and sync them across your devices.'}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <PasswordInput
        placeholder={mode === 'up' ? 'Password (at least 6 characters)' : 'Password'}
        value={password}
        onChangeText={setPassword}
        autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
        onSubmitEditing={mode === 'in' ? run : undefined}
      />
      {mode === 'up' && (
        <PasswordInput
          placeholder="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          autoComplete="new-password"
          onSubmitEditing={run}
        />
      )}
      {message && <Text style={[styles.muted, message.error && { color: colors.danger }]}>{message.text}</Text>}
      <Button
        title={busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}
        icon={mode === 'in' ? 'log-in-outline' : 'person-add-outline'}
        onPress={run}
        disabled={busy}
      />
      <Button
        title={mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        variant="secondary"
        onPress={() => switchMode(mode === 'in' ? 'up' : 'in')}
        disabled={busy}
      />
    </View>
  );
}

function PasswordInput({
  placeholder,
  value,
  onChangeText,
  autoComplete,
  onSubmitEditing,
}: {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  onSubmitEditing?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.passwordWrap}>
      <TextInput
        style={[styles.input, styles.passwordInput]}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
      />
      <Pressable
        style={styles.eye}
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? `Hide ${placeholder.toLowerCase()}` : `Show ${placeholder.toLowerCase()}`}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}
function BackupSection() {
  const { data, stats, mergeIn } = useTracker();

  const doExport = async () => {
    try {
      await exportBackup(data);
    } catch (e) {
      notify('Backup failed', errMsg(e));
    }
  };

  const doImport = async () => {
    try {
      const backup = await pickBackup();
      if (!backup) return;
      const shows = Object.keys(backup.shows).length;
      const eps = Object.keys(backup.watched).length;
      const ok = await ask(
        'Restore backup?',
        `This backup has ${shows} shows and ${eps} watched episodes. They will be combined with what's already on this device.`,
        'Restore'
      );
      if (!ok) return;
      mergeIn(backup);
      notify('Backup restored', 'Your shows and watched episodes have been restored.');
    } catch (e) {
      notify('Restore failed', errMsg(e));
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.muted}>
        Save a backup file ({stats.shows} shows, {stats.episodes} watched episodes) and open it on another device to
        copy your data over — no account needed.
      </Text>
      <Button title="Save backup file" icon="download-outline" onPress={doExport} />
      <Button title="Restore from backup" icon="folder-open-outline" variant="secondary" onPress={doImport} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, padding: 16, gap: 12, borderRadius: radius.lg, backgroundColor: colors.card },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  passwordWrap: { justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eye: { position: 'absolute', right: 12, padding: 2 },
  input: {
    color: colors.text,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
});
