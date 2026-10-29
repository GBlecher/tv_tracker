import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorView, Loading, Poster, PosterCard } from '@/components/ui';
import { colors, radius } from '@/constants/theme';
import { getPerson, getPersonCredits } from '@/lib/tvmaze';
import { useAsync } from '@/lib/useAsync';
import { age, formatDate, uniqueBy, yearRange } from '@/lib/utils';
import { getBio } from '@/lib/wikipedia';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [expanded, setExpanded] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const [person, credits] = await Promise.all([getPerson(id), getPersonCredits(id).catch(() => [])]);
    return { person, credits };
  }, [id]);

  const bio = useAsync(() => (data ? getBio(data.person.name) : Promise.resolve(null)), [data?.person.name]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorView error={error ?? new Error('Person not found')} onRetry={reload} />;

  const { person, credits } = data;
  const knownFor = uniqueBy(credits, (c) => c._embedded.show.id).sort(
    (a, b) => b._embedded.show.weight - a._embedded.show.weight
  );
  const facts: [keyof typeof Ionicons.glyphMap, string][] = [];
  if (person.birthday)
    facts.push([
      'gift-outline',
      `Born ${formatDate(person.birthday)}${person.deathday ? '' : ` (age ${age(person.birthday)})`}`,
    ]);
  if (person.deathday && person.birthday)
    facts.push(['flower-outline', `Died ${formatDate(person.deathday)} (aged ${age(person.birthday, person.deathday)})`]);
  if (person.country) facts.push(['location-outline', person.country.name]);
  if (person.gender) facts.push(['person-outline', person.gender]);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
      <Stack.Screen options={{ title: person.name }} />
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        <Poster image={person.image} width={120} rounded={radius.lg} icon="person" original />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.name}>{person.name}</Text>
          {!!bio.data?.description && <Text style={styles.desc}>{bio.data.description}</Text>}
          {facts.map(([icon, text]) => (
            <Text key={text} style={styles.fact}>
              <Ionicons name={icon} size={13} color={colors.accent} /> {text}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Biography</Text>
        {bio.loading ? (
          <Text style={styles.muted}>Loading biography…</Text>
        ) : bio.data ? (
          <>
            <Text style={styles.body} numberOfLines={expanded ? undefined : 6} onPress={() => setExpanded((x) => !x)}>
              {bio.data.extract}
            </Text>
            <Button
              title="Read more on Wikipedia"
              icon="book-outline"
              variant="secondary"
              onPress={() => WebBrowser.openBrowserAsync(bio.data!.url)}
            />
          </>
        ) : (
          <Text style={styles.muted}>No biography found for {person.name}.</Text>
        )}
      </View>

      {knownFor.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={styles.section}>Known for</Text>
          <View style={styles.grid}>
            {knownFor.map((c) => {
              const show = c._embedded.show;
              const role = c.self ? 'Self' : c._embedded.character.name;
              return (
                <PosterCard
                  key={show.id}
                  id={show.id}
                  name={show.name}
                  image={show.image}
                  width={104}
                  subtitle={`${role}${yearRange(show) ? ` · ${yearRange(show)}` : ''}`}
                />
              );
            })}
          </View>
        </View>
      )}

      <Button title="View on TVmaze" icon="open-outline" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(person.url)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.text, fontSize: 24, fontWeight: '900' },
  desc: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  fact: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 12 },
  section: { color: colors.text, fontWeight: '800', fontSize: 18 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
});
