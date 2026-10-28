import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth/AuthContext';
import { BeltMark } from '../components/BeltMark';
import { PrimaryButton } from '../components/PrimaryButton';
import { belts, colors, radius, space } from '../theme';

/** Placeholder home screen until we decide what it should show. */
export function HomeScreen() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const firstName = user?.full_name.split(' ')[0] ?? 'there';
  const rank = user?.belt_rank ?? 'White';
  const beltColor = belts[rank] ?? belts.White;

  return (
    <View style={styles.flex}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <View style={styles.top}>
            <BeltMark size="sm" />
          </View>

          <Text style={styles.greeting}>Oss, {firstName}.</Text>
          <Text style={styles.sub}>Your home screen is coming soon.</Text>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Current rank</Text>
            <View style={styles.rankRow}>
              <View style={[styles.rankBelt, { backgroundColor: beltColor }]} />
              <Text style={styles.rankText}>{rank} belt</Text>
            </View>
            <Text style={styles.email}>{user?.email}</Text>
          </View>

          <PrimaryButton
            title="Log out"
            variant="outline"
            loading={signingOut}
            onPress={async () => {
              setSigningOut(true);
              await signOut();
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: space(5), paddingTop: space(16), paddingBottom: space(10) },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  top: { alignItems: 'flex-start', marginBottom: space(10) },
  greeting: { color: colors.text, fontSize: 32, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 16, marginTop: space(2), marginBottom: space(8) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
    marginBottom: space(6),
  },
  cardLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', letterSpacing: 0.4, marginBottom: space(3) },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  rankBelt: { width: 44, height: 10, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  rankText: { color: colors.text, fontSize: 18, fontWeight: '700' },
  email: { color: colors.textMuted, fontSize: 14, marginTop: space(3) },
});
