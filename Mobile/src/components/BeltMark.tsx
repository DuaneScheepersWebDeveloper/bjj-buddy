import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

/** The BJJ Buddy logo: a black belt with its red rank bar and stripes, plus the wordmark. */
export function BeltMark({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <View style={styles.wrap}>
      <View style={[styles.belt, lg ? styles.beltLg : styles.beltSm]}>
        <View style={[styles.bar, lg ? styles.barLg : styles.barSm]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.stripe, lg ? styles.stripeLg : styles.stripeSm]} />
          ))}
        </View>
      </View>
      <Text style={[styles.word, lg ? styles.wordLg : styles.wordSm]}>
        BJJ <Text style={styles.wordAccent}>BUDDY</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  belt: {
    backgroundColor: '#050506',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#2C2F36',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  beltLg: { width: 132, height: 22, marginBottom: 16 },
  beltSm: { width: 66, height: 11, marginBottom: 8 },
  bar: {
    backgroundColor: colors.accent,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  barLg: { width: 40, marginRight: 14 },
  barSm: { width: 20, marginRight: 7 },
  stripe: { backgroundColor: colors.white, height: '100%' },
  stripeLg: { width: 3 },
  stripeSm: { width: 1.5 },
  word: { color: colors.text, fontWeight: '900', letterSpacing: 4 },
  wordLg: { fontSize: 28 },
  wordSm: { fontSize: 15, letterSpacing: 2.5 },
  wordAccent: { color: colors.accent },
});
