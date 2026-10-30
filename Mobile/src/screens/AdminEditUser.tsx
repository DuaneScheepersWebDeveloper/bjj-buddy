import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ApiError, type User } from '../lib/api';
import { Banner } from '../components/AuthLayout';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { BeltBadge, MAX_STRIPES, formatRank } from '../components/BeltBadge';
import { belts, colors, radius, space } from '../theme';

const BELT_ORDER = ['White', 'Blue', 'Purple', 'Brown', 'Black'] as const;

type Props = {
  user: User;
  onCancel: () => void;
  onSaved: (updated: User) => void;
};

/** Admin form for editing one user's details, belt, role and status. */
export function AdminEditUser({ user, onCancel, onSaved }: Props) {
  const { request, user: me, refreshUser } = useAuth();
  const isMe = user.id === me?.id;

  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [belt, setBelt] = useState(user.belt_rank);
  const [stripes, setStripes] = useState(user.stripes ?? 0);
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Android back button goes back to the list instead of leaving the Admin page.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [onCancel]);

  // Only send what actually changed.
  const changes: Record<string, unknown> = {};
  if (fullName.trim() !== user.full_name) changes.full_name = fullName.trim();
  if (email.trim().toLowerCase() !== user.email) changes.email = email.trim().toLowerCase();
  if (belt !== user.belt_rank) changes.belt_rank = belt;
  if (stripes !== (user.stripes ?? 0)) changes.stripes = stripes;
  if (role !== user.role) changes.role = role;
  if (isActive !== user.is_active) changes.is_active = isActive;
  const hasChanges = Object.keys(changes).length > 0;

  async function save() {
    if (saving || !hasChanges) return;
    if (!fullName.trim()) return setError('Enter a name');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address');

    setError(null);
    setSaving(true);
    try {
      const updated = await request<User>(`/admin/users/${user.id}`, { method: 'PATCH', body: changes });
      if (isMe) await refreshUser().catch(() => {});
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  return (
    <View>
      <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>‹ All users</Text>
      </Pressable>
      <Text style={styles.title}>Edit user</Text>
      <Text style={styles.hint}>{isMe ? 'This is your own account.' : user.email}</Text>

      {error ? <Banner kind="error" message={error} /> : null}

      <View style={styles.card}>
        <TextField label="Name" value={fullName} onChangeText={setFullName} autoCapitalize="words" autoCorrect={false} />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Belt</Text>
        <View style={styles.belts}>
          {BELT_ORDER.map((b) => {
            const on = belt === b;
            return (
              <Pressable
                key={b}
                onPress={() => {
                  // A new belt starts with no stripes.
                  if (b !== belt) setStripes(b === user.belt_rank ? (user.stripes ?? 0) : 0);
                  setBelt(b);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${b} belt`}
                style={[styles.beltChip, on && styles.beltChipOn]}
              >
                <View style={[styles.beltSwatch, { backgroundColor: belts[b] }]} />
                <Text style={[styles.beltText, on && styles.beltTextOn]}>{b}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Stripes</Text>
        <Segmented
          options={Array.from({ length: MAX_STRIPES + 1 }, (_, n) => ({ value: String(n), label: String(n) }))}
          value={String(stripes)}
          onChange={(v) => setStripes(Number(v))}
        />
        <View style={styles.preview}>
          <BeltBadge belt={belt} stripes={stripes} size="lg" />
          <Text style={styles.previewText}>{formatRank(belt, stripes)}</Text>
        </View>

        <Text style={styles.label}>Role</Text>
        <Segmented
          options={[
            { value: 'user', label: 'User' },
            { value: 'admin', label: 'Admin' },
          ]}
          value={role}
          onChange={(v) => setRole(v as User['role'])}
          disabled={isMe}
        />
        <Text style={styles.note}>
          {isMe ? "You can't change your own role." : 'Admins can manage other users from this page.'}
        </Text>

        <Text style={styles.label}>Status</Text>
        <Segmented
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          value={isActive ? 'active' : 'inactive'}
          onChange={(v) => setIsActive(v === 'active')}
          disabled={isMe}
          danger={!isActive}
        />
        <Text style={[styles.note, !isActive && user.is_active && styles.noteWarn]}>
          {isMe
            ? "You can't deactivate your own account."
            : !isActive && user.is_active
              ? "They'll be logged out straight away and won't be able to sign in."
              : 'Inactive users can’t sign in.'}
        </Text>
      </View>

      <View style={styles.buttons}>
        <PrimaryButton title="Save changes" onPress={save} loading={saving} disabled={!hasChanges} />
        <View style={styles.gap} />
        <PrimaryButton title="Cancel" variant="outline" onPress={onCancel} disabled={saving} />
      </View>
    </View>
  );
}

type SegmentedProps = {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  danger?: boolean;
};

function Segmented({ options, value, onChange, disabled, danger }: SegmentedProps) {
  return (
    <View style={[styles.segment, disabled && styles.segmentDisabled]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !!disabled }}
            style={[styles.segmentItem, on && (danger ? styles.segmentDanger : styles.segmentOn)]}
          >
            <Text style={[styles.segmentText, on && (danger ? styles.segmentTextDanger : styles.segmentTextOn)]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', paddingVertical: space(1), marginBottom: space(3) },
  backText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 16, marginTop: space(2), marginBottom: space(6) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: space(2),
    marginTop: space(1),
  },
  belts: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginBottom: space(5) },
  preview: { alignItems: 'center', gap: space(2), marginTop: space(4), marginBottom: space(5) },
  previewText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  beltChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  beltChipOn: { borderColor: colors.text, backgroundColor: colors.surfaceRaised },
  beltSwatch: { width: 18, height: 6, borderRadius: 2, borderWidth: 1, borderColor: colors.border },
  beltText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  beltTextOn: { color: colors.text },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  segmentDisabled: { opacity: 0.45 },
  segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.text },
  segmentDanger: { backgroundColor: colors.accent },
  segmentText: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
  segmentTextOn: { color: colors.background },
  segmentTextDanger: { color: colors.white },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: space(2), marginBottom: space(4) },
  noteWarn: { color: colors.danger },
  buttons: { marginTop: space(6) },
  gap: { height: space(3) },
});
