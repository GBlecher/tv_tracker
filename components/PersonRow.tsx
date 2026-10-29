import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Poster } from '@/components/ui';
import { colors, radius } from '@/constants/theme';
import type { TvImage } from '@/lib/tvmaze';

export function PersonRow({ id, name, image, role }: { id: number; name: string; image: TvImage; role: string }) {
  return (
    <Link href={`/person/${id}`} asChild>
      <Pressable style={styles.row}>
        <Poster image={image} width={52} height={52} rounded={26} icon="person" />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.role}>{role}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.cardAlt,
  },
  name: { color: colors.text, fontWeight: '600', fontSize: 15 },
  role: { color: colors.muted, fontSize: 13 },
});
