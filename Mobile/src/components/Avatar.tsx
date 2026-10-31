import { useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { API_URL } from '../lib/api';
import { belts } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';

type Props = {
  /** The user's avatar_url from the API (e.g. "/uploads/avatars/12-abc.jpg"), or null. */
  url: string | null | undefined;
  name: string | undefined;
  /** Belt colour for the ring around the picture. */
  belt?: string;
  size?: number;
};

/** Full address for a picture path the API gave us. */
export function avatarUri(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `${API_URL}${url}`;
}

function initials(name: string | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/**
 * Round profile picture with a ring in the user's belt colour and a soft glow.
 * Shows their initials when there's no picture (or it fails to load).
 */
export function Avatar({ url, name, belt = 'White', size = 56 }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [failed, setFailed] = useState(false);
  const uri = failed ? null : avatarUri(url);

  // Black belts get the red of their rank bar so the ring still shows on the dark theme;
  // white belts get a slightly deeper white so the ring shows on the light theme.
  const ring = belt === 'Black' ? colors.accent : belt === 'White' || !belts[belt] ? colors.whiteBelt : belts[belt];
  const ringWidth = Math.max(2, Math.round(size * 0.045));
  const gap = Math.max(2, Math.round(size * 0.04));
  const inner = size - 2 * (ringWidth + gap);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={uri ? `${name ?? 'User'}'s profile picture` : `${name ?? 'User'} (no profile picture)`}
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringWidth,
          borderColor: ring,
          padding: gap,
          shadowColor: ring,
          shadowRadius: size * 0.18,
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: colors.surfaceRaised }}
        />
      ) : (
        <View style={[styles.fallback, { width: inner, height: inner, borderRadius: inner / 2 }]}>
          <Text style={[styles.initials, { fontSize: Math.round(inner * 0.38) }]}>{initials(name)}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    shadowOpacity: Platform.OS === 'ios' ? 0.55 : 0,
    shadowOffset: { width: 0, height: 0 },
  },
  fallback: { backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.text, fontWeight: '800', letterSpacing: 0.5 },
}));
