import { forwardRef, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import { ApiError, isNetworkError, type ProfileChanges, type User } from '../lib/api';
import { useOfflineSync } from '../offline/OfflineSync';
import { Banner } from '../components/AuthLayout';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { BeltBadge, formatRank } from '../components/BeltBadge';
import { Avatar } from '../components/Avatar';
import { searchCountries } from '../data/countries';
import { colors, radius, space } from '../theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const POPULAR_SUBS = [
  'Rear naked choke',
  'Armbar',
  'Triangle',
  'Kimura',
  'Guillotine',
  'Bow and arrow',
  "D'Arce",
  'Heel hook',
  'Omoplata',
  'Ezekiel',
];

/** "1990-05-14" -> "14 May 1990" */
function formatBirthday(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Your own profile: view it, and tap Edit to change it. */
export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const { user, uploadAvatar, removeAvatar } = useAuth();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  async function choosePhoto(source: 'library' | 'camera') {
    setPhotoMenu(false);
    setPhotoError(null);
    setNotice(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setPhotoError('BJJ Buddy needs camera access to take a photo. You can allow it in your phone settings.');
          return;
        }
      }
      // Square crop, compressed, and returned as base64 so it can be sent to the API.
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const picked = result.canceled ? null : result.assets?.[0];
      if (!picked?.base64) return;

      setPhotoBusy(true);
      await uploadAvatar(picked.base64);
      setNotice('Profile picture updated.');
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Couldn't update your picture. Please try again.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function deletePhoto() {
    setPhotoMenu(false);
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      await removeAvatar();
      setNotice('Profile picture removed.');
    } catch (err) {
      setPhotoError(err instanceof ApiError ? err.message : "Couldn't remove your picture. Please try again.");
    } finally {
      setPhotoBusy(false);
    }
  }

  if (!user) return null;

  if (editing) {
    return (
      <EditProfile
        user={user}
        onCancel={() => setEditing(false)}
        onSaved={(where) => {
          setEditing(false);
          setNotice(
            where === 'server'
              ? 'Profile saved.'
              : "You're offline, so your changes are saved on this phone. They'll upload automatically when you're back online.",
          );
        }}
      />
    );
  }

  const rows: { label: string; value: string | null }[] = [
    { label: 'Gym', value: user.gym },
    { label: 'Favourite submission', value: user.favourite_sub },
    { label: 'Age', value: user.age != null ? String(user.age) : null },
    { label: 'Birthday', value: formatBirthday(user.birthday) },
    { label: 'Country', value: user.country },
    { label: 'Email', value: user.email },
  ];

  return (
    <View>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>
      <Text style={styles.title}>Profile</Text>

      {photoError ? <Banner kind="error" message={photoError} /> : notice ? <Banner kind="info" message={notice} /> : null}

      <View style={[styles.card, styles.header]}>
        <Pressable
          onPress={() => !photoBusy && setPhotoMenu((m) => !m)}
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
          style={styles.avatarWrap}
        >
          <Avatar url={user.avatar_url} name={user.full_name} belt={user.belt_rank} size={76} />
          {photoBusy ? (
            <View style={styles.avatarBusy}>
              <ActivityIndicator color={colors.white} />
            </View>
          ) : null}
          <View style={styles.avatarBadge}>
            <Text style={styles.avatarBadgeText}>✎</Text>
          </View>
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>{user.full_name}</Text>
          {user.username ? <Text style={styles.username}>@{user.username}</Text> : null}
          <Text style={styles.rank}>{formatRank(user.belt_rank, user.stripes)}</Text>
        </View>
        <BeltBadge belt={user.belt_rank} stripes={user.stripes} size="sm" />
      </View>

      {photoMenu ? (
        <View style={[styles.card, styles.photoMenu]}>
          <PhotoOption label="Choose from gallery" onPress={() => choosePhoto('library')} />
          <PhotoOption label="Take a photo" onPress={() => choosePhoto('camera')} />
          {user.avatar_url ? <PhotoOption label="Remove photo" danger onPress={deletePhoto} /> : null}
          <PhotoOption label="Cancel" muted onPress={() => setPhotoMenu(false)} last />
        </View>
      ) : null}

      <View style={styles.card}>
        {rows.map((r, i) => (
          <View key={r.label} style={[styles.row, i < rows.length - 1 && styles.rowBorder]}>
            <Text style={styles.rowLabel}>{r.label}</Text>
            <Text style={[styles.rowValue, !r.value && styles.rowEmpty]} numberOfLines={2}>
              {r.value ?? 'Not set'}
            </Text>
          </View>
        ))}
      </View>

      <PrimaryButton
        title="Edit profile"
        onPress={() => {
          setNotice(null);
          setEditing(true);
        }}
      />
    </View>
  );
}

function PhotoOption({
  label,
  onPress,
  danger,
  muted,
  last,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  muted?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.photoOption, !last && styles.rowBorder, pressed && styles.photoOptionPressed]}
    >
      <Text style={[styles.photoOptionText, danger && styles.photoDanger, muted && styles.photoMuted]}>{label}</Text>
    </Pressable>
  );
}

type EditProps = { user: User; onCancel: () => void; onSaved: (where: 'server' | 'phone') => void };

/** Age from a "YYYY-MM-DD" birthday, matching the server's calculation. */
function ageFrom(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  const had = now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() >= d);
  return now.getFullYear() - y - (had ? 0 : 1);
}

function EditProfile({ user, onCancel, onSaved }: EditProps) {
  const { updateProfile, replaceUser } = useAuth();
  const { sendOrQueue } = useOfflineSync();
  const [fullName, setFullName] = useState(user.full_name);
  const [username, setUsername] = useState(user.username ?? '');
  const [email, setEmail] = useState(user.email);
  const [gym, setGym] = useState(user.gym ?? '');
  const [favSub, setFavSub] = useState(user.favourite_sub ?? '');
  const [country, setCountry] = useState(user.country ?? '');
  const [countryFocused, setCountryFocused] = useState(false);
  const [bYear, bMonth, bDay] = (user.birthday ?? '--').split('-');
  const [day, setDay] = useState(bDay ?? '');
  const [month, setMonth] = useState(bMonth ?? '');
  const [year, setYear] = useState(bYear ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  // Android back button cancels editing instead of leaving the page.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [onCancel]);

  const suggestions = countryFocused ? searchCountries(country).filter((c) => c !== country) : [];

  /** Returns "YYYY-MM-DD", null (no birthday), or an error message. */
  function readBirthday(): { value: string | null } | { error: string } {
    const d = day.trim(), m = month.trim(), y = year.trim();
    if (!d && !m && !y) return { value: null };
    if (!d || !m || !y) return { error: 'Fill in the day, month and year of your birthday (or leave all three empty)' };
    const dn = Number(d), mn = Number(m), yn = Number(y);
    const date = new Date(yn, mn - 1, dn);
    if (y.length !== 4 || date.getFullYear() !== yn || date.getMonth() !== mn - 1 || date.getDate() !== dn) {
      return { error: "That birthday isn't a real date" };
    }
    if (date > new Date()) return { error: "Birthday can't be in the future" };
    return { value: `${yn}-${String(mn).padStart(2, '0')}-${String(dn).padStart(2, '0')}` };
  }

  async function save() {
    if (saving) return;
    if (!fullName.trim()) return setError('Enter your name');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address');
    const u = username.trim().replace(/^@/, '').toLowerCase();
    if (user.username && !u) return setError("Username can't be empty");
    if (u && (u.length < 3 || u.length > 30)) return setError('Username must be 3-30 characters');
    if (u && !/^[a-z0-9][a-z0-9._]*$/.test(u)) return setError('Username can only use letters, numbers, dots and underscores');
    const bday = readBirthday();
    if ('error' in bday) return setError(bday.error);

    const changes: ProfileChanges = {};
    if (fullName.trim() !== user.full_name) changes.full_name = fullName.trim();
    if (u && u !== (user.username ?? '')) changes.username = u;
    if (email.trim().toLowerCase() !== user.email) changes.email = email.trim().toLowerCase();
    if ((gym.trim() || null) !== user.gym) changes.gym = gym.trim() || null;
    if ((favSub.trim() || null) !== user.favourite_sub) changes.favourite_sub = favSub.trim() || null;
    if ((country.trim() || null) !== user.country) changes.country = country.trim() || null;
    if (bday.value !== user.birthday) changes.birthday = bday.value;

    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }
    setError(null);
    setSaving(true);

    // Username and email must be checked by the server straight away (someone else
    // might already have them), so those need a connection.
    if ('username' in changes || 'email' in changes) {
      try {
        await updateProfile(changes);
        onSaved('server');
      } catch (err) {
        setError(
          isNetworkError(err)
            ? "You're offline. Changing your username or email needs an internet connection. Undo those two to save your other changes on this phone for now."
            : err instanceof ApiError
              ? err.message
              : 'Something went wrong. Please try again.',
        );
        setSaving(false);
      }
      return;
    }

    // Everything else can be saved offline and uploaded later.
    try {
      const result = await sendOrQueue<User>({
        path: '/auth/me',
        method: 'PATCH',
        body: changes,
        label: 'Profile changes',
        coalesceKey: 'profile',
      });
      if (result.status === 'sent') {
        await replaceUser(result.data);
        onSaved('server');
      } else {
        const birthday = 'birthday' in changes ? changes.birthday ?? null : user.birthday;
        await replaceUser({ ...user, ...changes, birthday, age: ageFrom(birthday) } as User);
        onSaved('phone');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  const digits = (setter: (v: string) => void, max: number, next?: () => void) => (t: string) => {
    const v = t.replace(/\D/g, '').slice(0, max);
    setter(v);
    if (v.length === max) next?.();
  };

  return (
    <View>
      <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>‹ Profile</Text>
      </Pressable>
      <Text style={styles.title}>Edit profile</Text>

      {error ? <Banner kind="error" message={error} /> : null}

      <View style={styles.card}>
        <TextField label="Name" value={fullName} onChangeText={setFullName} autoCapitalize="words" autoCorrect={false} />
        <TextField
          label="Username"
          value={username}
          onChangeText={(t) => setUsername(t.replace(/\s/g, ''))}
          placeholder="e.g. duane_bjj"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.card}>
        <TextField label="Gym" value={gym} onChangeText={setGym} placeholder="Where you train" autoCapitalize="words" />

        <TextField
          label="Favourite submission"
          value={favSub}
          onChangeText={setFavSub}
          placeholder="Type one, or tap below"
          autoCapitalize="sentences"
        />
        <View style={styles.chips}>
          {POPULAR_SUBS.map((s) => {
            const on = favSub.trim().toLowerCase() === s.toLowerCase();
            return (
              <Pressable
                key={s}
                onPress={() => setFavSub(on ? '' : s)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Birthday</Text>
        <View style={styles.dateRow}>
          <DateBox value={day} onChangeText={digits(setDay, 2, () => monthRef.current?.focus())} placeholder="DD" />
          <Text style={styles.dateSep}>/</Text>
          <DateBox
            ref={monthRef}
            value={month}
            onChangeText={digits(setMonth, 2, () => yearRef.current?.focus())}
            placeholder="MM"
          />
          <Text style={styles.dateSep}>/</Text>
          <DateBox ref={yearRef} value={year} onChangeText={digits(setYear, 4)} placeholder="YYYY" wide />
        </View>
        <Text style={styles.note}>Your age is worked out from this.</Text>

        <TextField
          label="Country"
          value={country}
          onChangeText={setCountry}
          placeholder="Start typing your country"
          autoCapitalize="words"
          autoCorrect={false}
          onFocus={() => setCountryFocused(true)}
          onBlur={() => setTimeout(() => setCountryFocused(false), 150)}
        />
        {suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            {suggestions.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  setCountry(c);
                  setCountryFocused(false);
                }}
                style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.suggestionText}>{c}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <Text style={styles.footnote}>Your belt and stripes are set by your coach (an admin).</Text>

      <PrimaryButton title="Save changes" onPress={save} loading={saving} />
      <View style={styles.gap} />
      <PrimaryButton title="Cancel" variant="outline" onPress={onCancel} disabled={saving} />
    </View>
  );
}

type DateBoxProps = { value: string; onChangeText: (t: string) => void; placeholder: string; wide?: boolean };
const DateBox = forwardRef<TextInput, DateBoxProps>(function DateBox({ value, onChangeText, placeholder, wide }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      selectionColor={colors.accent}
      keyboardType="number-pad"
      maxLength={wide ? 4 : 2}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityLabel={placeholder === 'DD' ? 'Birthday day' : placeholder === 'MM' ? 'Birthday month' : 'Birthday year'}
      style={[styles.dateBox, wide && styles.dateBoxWide, focused && styles.dateBoxFocused]}
    />
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { alignSelf: 'flex-start', paddingVertical: space(1), marginBottom: space(3) },
  backText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', marginBottom: space(5) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
    marginBottom: space(4),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(4) },
  avatarWrap: { position: 'relative' },
  avatarBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadgeText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  photoMenu: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  photoOption: { paddingHorizontal: space(5), paddingVertical: space(4) },
  photoOptionPressed: { backgroundColor: colors.surfaceRaised },
  photoOptionText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  photoDanger: { color: colors.danger },
  photoMuted: { color: colors.textMuted },
  name: { color: colors.text, fontSize: 22, fontWeight: '800' },
  username: { color: colors.textMuted, fontSize: 15, marginTop: space(1) },
  rank: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: space(2) },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space(3), gap: space(4) },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  rowValue: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  rowEmpty: { color: colors.textMuted, fontWeight: '400', fontStyle: 'italic' },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', letterSpacing: 0.4, marginBottom: space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: -space(2), marginBottom: space(5) },
  chip: {
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: colors.background },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  dateBox: {
    width: 64,
    minHeight: 52,
    textAlign: 'center',
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  dateBoxWide: { width: 88 },
  dateBoxFocused: { borderColor: colors.borderFocus },
  dateSep: { color: colors.textMuted, fontSize: 18 },
  note: { color: colors.textMuted, fontSize: 13, marginTop: space(2), marginBottom: space(5) },
  suggestions: {
    marginTop: -space(2),
    marginBottom: space(2),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  suggestion: { paddingHorizontal: space(4), paddingVertical: space(3), backgroundColor: colors.surfaceRaised },
  suggestionPressed: { backgroundColor: colors.border },
  suggestionText: { color: colors.text, fontSize: 15 },
  footnote: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: space(4) },
  gap: { height: space(3) },
});
