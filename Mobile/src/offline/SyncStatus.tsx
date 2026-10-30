import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useOfflineSync } from './OfflineSync';
import { colors, radius, space } from '../theme';

const AMBER = '#E8A33D';
const GREEN = '#4CC38A';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(iso).toLocaleDateString();
}

// Space above the bottom edge (clears the phone's gesture bar / home indicator).
const BOTTOM = Platform.OS === 'ios' ? 34 : Platform.OS === 'android' ? 28 : space(5);

/**
 * Status bar for the offline outbox, floating at the bottom of the screen.
 * Hidden when everything is uploaded, except for a brief "All changes uploaded" after a sync.
 * Tap it to open the details panel above it.
 */
export function SyncStatus() {
  const { pending, failed, syncing, offline, lastUploadAt, syncNow, retryFailed, dismissFailed } = useOfflineSync();
  const [open, setOpen] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);

  useEffect(() => {
    if (!lastUploadAt || pending.length > 0) return;
    setJustUploaded(true);
    const t = setTimeout(() => setJustUploaded(false), 3500);
    return () => clearTimeout(t);
  }, [lastUploadAt, pending.length]);

  if (pending.length === 0 && failed.length === 0) {
    if (!justUploaded) return null;
    return (
      <View style={styles.dock} pointerEvents="none">
        <View style={styles.pill} accessibilityLiveRegion="polite">
          <View style={[styles.dot, { backgroundColor: GREEN }]} />
          <Text style={styles.text}>All changes uploaded</Text>
        </View>
      </View>
    );
  }

  let dot = AMBER;
  let message: string;
  if (syncing) {
    message = `Uploading ${plural(pending.length, 'change')}…`;
  } else if (pending.length > 0 && offline) {
    message = `Offline · ${plural(pending.length, 'change')} saved on this phone`;
  } else if (pending.length > 0) {
    message = `${plural(pending.length, 'change')} waiting to upload`;
  } else {
    dot = colors.danger;
    message = `${plural(failed.length, 'change')} couldn't be saved`;
  }

  return (
    <View style={styles.dock} pointerEvents="box-none">
      {open ? (
        <View style={styles.panel}>
          <Text style={styles.explain}>
            {pending.length === 0
              ? "The server didn't accept this change. You can try again or discard it."
              : offline
                ? "You're offline. These are safely stored on this phone and will upload automatically when you're back online."
                : 'These will upload automatically. You can also try now.'}
          </Text>

          {pending.map((item) => (
            <View key={item.id} style={styles.item}>
              <View style={styles.itemText}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={styles.itemMeta}>Saved {timeAgo(item.createdAt)}</Text>
              </View>
              <Text style={[styles.badge, { color: AMBER, borderColor: AMBER }]}>WAITING</Text>
            </View>
          ))}

          {failed.map((item) => (
            <View key={item.id} style={styles.item}>
              <View style={styles.itemText}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={[styles.itemMeta, { color: colors.danger }]}>{item.lastError ?? 'The server refused this change.'}</Text>
                <View style={styles.itemActions}>
                  <Pressable onPress={() => retryFailed(item.id)} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.link}>Try again</Text>
                  </Pressable>
                  <Pressable onPress={() => dismissFailed(item.id)} hitSlop={8} accessibilityRole="button">
                    <Text style={[styles.link, styles.linkMuted]}>Discard</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}

          {pending.length > 0 ? (
            <Pressable
              onPress={() => syncNow()}
              disabled={syncing}
              accessibilityRole="button"
              style={({ pressed }) => [styles.syncBtn, (pressed || syncing) && styles.pressed]}
            >
              <Text style={styles.syncText}>{syncing ? 'Uploading…' : 'Upload now'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${message}. Tap for details.`}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      >
        {syncing ? <ActivityIndicator size="small" color={AMBER} /> : <View style={[styles.dot, { backgroundColor: dot }]} />}
        <Text style={styles.text} numberOfLines={1}>{message}</Text>
        <Text style={styles.chevron}>{open ? '▾' : '▴'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: space(4),
    right: space(4),
    bottom: BOTTOM,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  pressed: { opacity: 0.7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { color: colors.text, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  chevron: { color: colors.textMuted, fontSize: 12 },
  panel: {
    width: '100%',
    maxWidth: 420,
    marginBottom: space(2),
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(4),
  },
  explain: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: space(3) },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(2),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space(3),
  },
  itemText: { flex: 1 },
  itemLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  itemMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  itemActions: { flexDirection: 'row', gap: space(4), marginTop: space(2) },
  link: { color: colors.text, fontSize: 13, fontWeight: '700' },
  linkMuted: { color: colors.textMuted },
  badge: { fontSize: 10, fontWeight: '800', letterSpacing: 1, borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  syncBtn: {
    marginTop: space(3),
    alignItems: 'center',
    paddingVertical: space(3),
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  syncText: { color: colors.text, fontSize: 14, fontWeight: '700' },
});
