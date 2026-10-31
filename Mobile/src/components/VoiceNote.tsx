import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useAuth } from '../auth/AuthContext';
import { useOfflineSync } from '../offline/OfflineSync';
import { ApiError, isNetworkError } from '../lib/api';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';

export type VoiceField = 'went_right' | 'went_wrong' | 'to_improve';

type VoiceStatus = { enabled: boolean; max_seconds: number };
type VoiceResult = { transcript: string; text: string; tidied: boolean };

// Asked once per app launch: is voice set up on the server, and how long can a recording be?
let statusCache: VoiceStatus | null = null;
const DEFAULT_MAX_SECONDS = 300;

type State =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'working' }
  | { kind: 'waiting'; uri: string } // recorded offline: turns into text when back online
  | { kind: 'review'; result: VoiceResult }
  | { kind: 'error'; message: string; uri?: string };

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Read a recorded file as base64 (works on phones and in the browser, no extra packages). */
async function readAsBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the recording'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

type Props = {
  field: VoiceField;
  /** What's already typed in the box (decides whether to offer "Add" or "Use"). */
  current: string | null;
  onUse: (text: string) => void;
};

/**
 * Record a voice note instead of typing. You talk, it comes back as clear written notes
 * (BJJ terms spelled right), and you choose to use it, add it to what you typed, or discard it.
 * Recorded with no signal? It's kept and turned into text when you're back online.
 */
export function VoiceNote({ field, current, onUse }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { request } = useAuth();
  const { offline } = useOfflineSync();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const recordingRef = useRef(false);
  recordingRef.current = state.kind === 'recording';
  const [status, setStatus] = useState<VoiceStatus | null>(statusCache);
  const [showWords, setShowWords] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;
  const maxSeconds = status?.max_seconds ?? DEFAULT_MAX_SECONDS;

  useEffect(() => {
    if (statusCache) return;
    request<VoiceStatus>('/voice/status', { timeoutMs: 8000 })
      .then((s) => {
        statusCache = s;
        setStatus(s);
      })
      .catch(() => {}); // offline: let them record anyway; we'll find out later
  }, [request]);

  // Pulsing red dot while recording.
  useEffect(() => {
    if (state.kind !== 'recording') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state.kind, pulse]);

  const process = useCallback(
    async (uri: string) => {
      setState({ kind: 'working' });
      try {
        const audio_base64 = await readAsBase64(uri);
        const result = await request<VoiceResult>('/voice/notes', {
          method: 'POST',
          body: { audio_base64, field },
          timeoutMs: 120_000,
        });
        setShowWords(false);
        setState({ kind: 'review', result });
      } catch (err) {
        if (isNetworkError(err)) setState({ kind: 'waiting', uri });
        else setState({ kind: 'error', message: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.', uri });
      }
    },
    [request, field],
  );

  // Recorded offline: try again as soon as the phone is back online.
  useEffect(() => {
    if (state.kind === 'waiting' && !offline) process(state.uri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  async function start() {
    if (status && !status.enabled) {
      setState({ kind: 'error', message: "Voice notes aren't set up on the server yet. See “Voice notes” in the README." });
      return;
    }
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setState({ kind: 'error', message: 'BJJ Buddy needs the microphone to record. You can allow it in your phone settings.' });
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState({ kind: 'recording' });
    } catch {
      setState({ kind: 'error', message: "Couldn't start recording. Please try again." });
    }
  }

  const stop = useCallback(
    async (keep: boolean) => {
      try {
        await recorder.stop();
      } catch {
        // already stopped
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      const uri = recorder.uri;
      if (!keep || !uri) return setState({ kind: 'idle' });
      process(uri);
    },
    [recorder, process],
  );

  // Stop by itself at the time limit.
  const elapsed = recorderState.durationMillis ?? 0;
  useEffect(() => {
    if (state.kind === 'recording' && elapsed >= maxSeconds * 1000) stop(true);
  }, [state.kind, elapsed, maxSeconds, stop]);

  // Stop the microphone if you leave the page mid-recording.
  useEffect(
    () => () => {
      if (!recordingRef.current) return;
      try {
        recorder.stop().catch(() => {});
      } catch {
        // already released
      }
    },
    [recorder],
  );

  const hasText = !!current?.trim();

  // --- Views --------------------------------------------------------------------------

  if (state.kind === 'recording') {
    const left = Math.max(0, maxSeconds * 1000 - elapsed);
    return (
      <View style={[styles.box, styles.recordingBox]}>
        <View style={styles.recRow}>
          <Animated.View style={[styles.recDot, { opacity: pulse }]} />
          <Text style={styles.recTime} accessibilityLiveRegion="polite">
            {clock(elapsed)}
          </Text>
          <Text style={styles.recLimit}>{left < 30_000 ? `${Math.ceil(left / 1000)} s left` : `of ${clock(maxSeconds * 1000)}`}</Text>
        </View>
        <Text style={styles.hint}>Talk like you'd tell a training partner. Take your time.</Text>
        <View style={styles.row}>
          <Pressable onPress={() => stop(false)} hitSlop={8} accessibilityRole="button" style={styles.textBtn}>
            <Text style={styles.textBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => stop(true)}
            accessibilityRole="button"
            accessibilityLabel="Stop and turn into text"
            style={({ pressed }) => [styles.stopBtn, pressed && styles.pressed]}
          >
            <View style={styles.stopSquare} />
            <Text style={styles.stopText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (state.kind === 'working') {
    return (
      <View style={[styles.box, styles.centerRow]}>
        <ActivityIndicator color={colors.text} />
        <Text style={styles.workingText}>Turning your voice note into text…</Text>
      </View>
    );
  }

  if (state.kind === 'waiting') {
    return (
      <View style={styles.box}>
        <Text style={styles.title}>Voice note saved</Text>
        <Text style={styles.hint}>No signal right now. It'll turn into text as soon as you're back online. Keep this page open.</Text>
        <View style={styles.row}>
          <Pressable onPress={() => setState({ kind: 'idle' })} hitSlop={8} accessibilityRole="button" style={styles.textBtn}>
            <Text style={styles.textBtnText}>Discard</Text>
          </Pressable>
          <Pressable onPress={() => process(state.uri)} accessibilityRole="button" style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
            <Text style={styles.smallBtnText}>Try now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (state.kind === 'review') {
    const { result } = state;
    const use = (text: string) => {
      onUse(text);
      setState({ kind: 'idle' });
    };
    return (
      <View style={[styles.box, styles.reviewBox]}>
        <Text style={styles.title}>From your voice note</Text>
        <Text style={styles.result} selectable>
          {result.text}
        </Text>
        {result.tidied ? (
          <Pressable onPress={() => setShowWords((s) => !s)} hitSlop={8} accessibilityRole="button" style={styles.wordsToggle}>
            <Text style={styles.wordsToggleText}>{showWords ? 'Hide what you said word for word' : 'Show what you said word for word'}</Text>
          </Pressable>
        ) : null}
        {showWords ? <Text style={styles.words}>“{result.transcript}”</Text> : null}
        <View style={styles.reviewActions}>
          <Pressable
            onPress={() => use(hasText ? `${current!.trim()}\n${result.text}` : result.text)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.useBtn, pressed && styles.pressed]}
          >
            <Text style={styles.useBtnText}>{hasText ? 'Add to my notes' : 'Use this'}</Text>
          </Pressable>
          {hasText ? (
            <Pressable onPress={() => use(result.text)} accessibilityRole="button" style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
              <Text style={styles.smallBtnText}>Replace</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.row}>
          <Pressable onPress={() => setState({ kind: 'idle' })} hitSlop={8} accessibilityRole="button" style={styles.textBtn}>
            <Text style={styles.textBtnText}>Discard</Text>
          </Pressable>
          <Pressable onPress={start} hitSlop={8} accessibilityRole="button" style={styles.textBtn}>
            <Text style={styles.textBtnText}>Record again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View>
      {state.kind === 'error' ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{state.message}</Text>
          {state.uri ? (
            <Pressable onPress={() => process(state.uri!)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.errorRetry}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Pressable
        onPress={start}
        accessibilityRole="button"
        accessibilityLabel="Record a voice note instead of typing"
        style={({ pressed }) => [styles.micBtn, pressed && styles.pressed]}
      >
        <View style={styles.micIcon}>
          <View style={styles.micHead} />
          <View style={styles.micStand} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.micTitle}>Record instead</Text>
          <Text style={styles.micSub}>Talk it through; it comes back as clear notes</Text>
        </View>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space(3) },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  box: {
    marginTop: space(3),
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space(4),
  },
  recordingBox: { borderColor: colors.danger },
  reviewBox: { borderColor: colors.success },
  title: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: space(2) },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },

  micBtn: {
    marginTop: space(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    paddingVertical: space(3),
    paddingHorizontal: space(4),
  },
  micIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micHead: { width: 10, height: 15, borderRadius: 5, backgroundColor: colors.white },
  micStand: { width: 2, height: 4, backgroundColor: colors.white, marginTop: 1 },
  micTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  micSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },

  recRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(2) },
  recDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.danger },
  recTime: { color: colors.text, fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  recLimit: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: colors.danger,
    borderRadius: 999,
    paddingVertical: space(2) + 2,
    paddingHorizontal: space(5),
  },
  stopSquare: { width: 12, height: 12, borderRadius: 2, backgroundColor: colors.white },
  stopText: { color: colors.white, fontSize: 15, fontWeight: '800' },

  workingText: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },

  result: { color: colors.text, fontSize: 15, lineHeight: 22 },
  wordsToggle: { marginTop: space(3), alignSelf: 'flex-start' },
  wordsToggleText: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  words: { color: colors.textMuted, fontSize: 13, lineHeight: 19, fontStyle: 'italic', marginTop: space(2) },
  reviewActions: { flexDirection: 'row', gap: space(3), marginTop: space(4) },
  useBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.success,
    borderRadius: radius.sm,
    paddingVertical: space(3),
  },
  useBtnText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  smallBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: space(2) + 2,
    paddingHorizontal: space(4),
  },
  smallBtnText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  textBtn: { paddingVertical: space(1) },
  textBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },

  errorBox: {
    marginTop: space(3),
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.md,
    padding: space(3),
    gap: space(2),
  },
  errorText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  errorRetry: { color: colors.text, fontSize: 13, fontWeight: '800' },
}));
