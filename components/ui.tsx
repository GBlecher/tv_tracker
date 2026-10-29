import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, radius } from '@/constants/theme';
import type { TvImage } from '@/lib/tvmaze';

export function Poster({
  image,
  width,
  height,
  rounded = radius.md,
  icon = 'tv-outline',
  original,
}: {
  image: TvImage | undefined;
  width: number | `${number}%`;
  height?: number;
  rounded?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  original?: boolean;
}) {
  const uri = original ? image?.original ?? image?.medium : image?.medium ?? image?.original;
  const style = {
    width,
    height: height ?? (typeof width === 'number' ? width * 1.47 : undefined),
    aspectRatio: height ? undefined : 0.68,
    borderRadius: rounded,
    backgroundColor: colors.cardAlt,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  if (!uri)
    return (
      <View style={style}>
        <Ionicons name={icon} size={28} color={colors.muted} />
      </View>
    );
  return <Image source={{ uri }} style={style} contentFit="cover" transition={150} />;
}

export function PosterCard({
  id,
  name,
  image,
  subtitle,
  width = 110,
}: {
  id: number;
  name: string;
  image: TvImage;
  subtitle?: string;
  width?: number;
}) {
  return (
    <Link href={`/show/${id}`} asChild>
      <Pressable style={{ width }}>
        <Poster image={image} width={width} />
        <Text style={styles.cardTitle} numberOfLines={1}>
          {name}
        </Text>
        {!!subtitle && (
          <Text style={styles.cardSub} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </Pressable>
    </Link>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

export function Dropdown({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.dropdown}>
      <Pressable
        style={styles.dropdownHeader}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        aria-expanded={open}>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
        <Text style={styles.dropdownTitle}>{title}</Text>
        {count != null && <Text style={styles.dropdownCount}>{count}</Text>}
      </Pressable>
      {open && <View style={styles.dropdownBody}>{children}</View>}
    </View>
  );
}

export function ProgressBar({ value, style }: { value: number; style?: StyleProp<ViewStyle> }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[styles.progressTrack, style]}>
      <View style={[styles.progressFill, { width: `${pct}%` }]} />
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} size="large" />
      {!!label && <Text style={styles.muted}>{label}</Text>}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
      <Text style={styles.muted}>{error.message || 'Something went wrong'}</Text>
      {onRetry && <Button title="Try again" onPress={onRetry} />}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={[styles.center, { paddingVertical: 48 }]}>
      <Ionicons name={icon} size={48} color={colors.accent} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!message && <Text style={[styles.muted, { textAlign: 'center' }]}>{message}</Text>}
      {action}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  style,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'youtube';
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const primary = variant === 'primary';
  const fg = primary ? colors.onAccent : colors.text;
  const bg = primary ? colors.accent : variant === 'youtube' ? colors.youtube : colors.cardAlt;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
        style,
      ]}>
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function WatchToggle({
  watched,
  onPress,
  onLongPress,
  disabled,
  size = 30,
}: {
  watched: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: watched, disabled }}
      style={{ opacity: disabled ? 0.3 : 1 }}>
      <Ionicons
        name={watched ? 'checkmark-circle' : 'checkmark-circle-outline'}
        size={size}
        color={watched ? colors.accent : colors.muted}
      />
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: colors.accent }]}>
            <Text style={[styles.segmentText, active && { color: colors.onAccent }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
      <Text style={[styles.chipText, active && { color: colors.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  dropdown: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden' },
  dropdownHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  dropdownTitle: { flex: 1, color: colors.text, fontWeight: '800', fontSize: 16 },
  dropdownCount: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  dropdownBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  cardTitle: { color: colors.text, fontWeight: '600', fontSize: 13, marginTop: 6 },
  cardSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  muted: { color: colors.muted, fontSize: 14 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  buttonText: { fontWeight: '700', fontSize: 15 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 999,
    padding: 4,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  segmentText: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
});
