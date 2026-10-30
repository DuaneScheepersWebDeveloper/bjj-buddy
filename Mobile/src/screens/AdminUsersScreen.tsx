import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ApiError, type User } from '../lib/api';
import { Banner } from '../components/AuthLayout';
import { AdminEditUser } from './AdminEditUser';
import { BeltBadge, formatRank } from '../components/BeltBadge';
import { BeltLoader } from '../components/BeltLoader';
import { belts, colors, radius, space } from '../theme';

type Filter = 'all' | 'active' | 'inactive';
type Summary = { total_users: number; active_users: number; inactive_users: number; admins: number };

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
];

/** Admin-only: see every user and activate / deactivate their accounts. */
export function AdminUsersScreen({ onBack }: { onBack: () => void }) {
  const { request, user: me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Deactivating asks for a second tap to confirm.
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const params: string[] = [];
    if (search.trim()) params.push(`search=${encodeURIComponent(search.trim())}`);
    if (filter !== 'all') params.push(`active=${filter === 'active'}`);
    const qs = params.join('&');
    try {
      const [list, counts] = await Promise.all([
        request<User[]>(`/admin/users${qs ? `?${qs}` : ''}`),
        request<Summary>('/admin/summary'),
      ]);
      setUsers(list);
      setSummary(counts);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load users.");
      setUsers((u) => u ?? []);
    }
  }, [request, search, filter]);

  // Reload when the filter changes, and shortly after typing stops in the search box.
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  async function setActive(target: User, isActive: boolean) {
    if (!isActive && confirmId !== target.id) {
      setConfirmId(target.id);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmId(null), 4000);
      return;
    }
    setConfirmId(null);
    setBusyId(target.id);
    try {
      const updated = await request<User>(`/admin/users/${target.id}/status`, {
        method: 'PATCH',
        body: { is_active: isActive },
      });
      // Drop them from the list if they no longer match the current filter.
      setUsers((list) =>
        (list ?? [])
          .map((u) => (u.id === updated.id ? updated : u))
          .filter((u) => filter === 'all' || u.is_active === (filter === 'active')),
      );
      setSummary((s) =>
        s && {
          ...s,
          active_users: s.active_users + (isActive ? 1 : -1),
          inactive_users: s.inactive_users + (isActive ? -1 : 1),
        },
      );
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  if (editing) {
    return (
      <AdminEditUser
        user={editing}
        onCancel={() => setEditing(null)}
        onSaved={(updated) => {
          setEditing(null);
          setNotice(`Saved changes to ${updated.full_name}.`);
          load();
        }}
      />
    );
  }

  return (
    <View>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backText}>‹ Home</Text>
      </Pressable>
      <Text style={styles.title}>Admin</Text>
      <Text style={styles.hint}>Manage who can use BJJ Buddy.</Text>

      {summary ? (
        <View style={styles.stats}>
          <Stat label="Users" value={summary.total_users} />
          <Stat label="Active" value={summary.active_users} />
          <Stat label="Inactive" value={summary.inactive_users} highlight={summary.inactive_users > 0} />
          <Stat label="Admins" value={summary.admins} />
        </View>
      ) : null}

      <View style={styles.searchBox}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or email"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
          returnKeyType="search"
        />
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setFilter(f.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.id }}
            style={[styles.filter, filter === f.id && styles.filterOn]}
          >
            <Text style={[styles.filterText, filter === f.id && styles.filterTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Banner kind="error" message={error} /> : notice ? <Banner kind="info" message={notice} /> : null}

      {users === null ? (
        <View style={styles.loading}>
          <BeltLoader size={56} />
        </View>
      ) : users.length === 0 ? (
        <Text style={styles.empty}>No users match.</Text>
      ) : (
        users.map((u) => {
          const isMe = u.id === me?.id;
          const confirming = confirmId === u.id;
          return (
            <Pressable
              key={u.id}
              onPress={() => {
                setNotice(null);
                setEditing(u);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${u.full_name}`}
              style={({ pressed }) => [styles.row, !u.is_active && styles.rowInactive, pressed && styles.rowPressed]}
            >
              <View style={[styles.belt, { backgroundColor: belts[u.belt_rank] ?? belts.White }]} />
              <View style={styles.rowText}>
                <View style={styles.nameLine}>
                  <Text style={styles.name} numberOfLines={1}>{u.full_name}</Text>
                  {u.role === 'admin' ? <Text style={styles.adminBadge}>ADMIN</Text> : null}
                </View>
                <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
                <View style={styles.rankLine}>
                  <BeltBadge belt={u.belt_rank} stripes={u.stripes} size="sm" />
                  <Text style={styles.rankText} numberOfLines={1}>{formatRank(u.belt_rank, u.stripes)}</Text>
                </View>
                <Text style={[styles.status, u.is_active ? styles.statusOn : styles.statusOff]}>
                  {u.is_active ? '● Active' : '● Inactive'}
                </Text>
              </View>

              {isMe ? (
                <Text style={styles.you}>You</Text>
              ) : busyId === u.id ? (
                <ActivityIndicator color={colors.text} style={styles.action} />
              ) : (
                <Pressable
                  onPress={() => setActive(u, !u.is_active)}
                  accessibilityRole="button"
                  accessibilityLabel={`${u.is_active ? 'Deactivate' : 'Activate'} ${u.full_name}`}
                  style={({ pressed }) => [
                    styles.action,
                    u.is_active ? (confirming ? styles.actionConfirm : styles.actionOff) : styles.actionOn,
                    pressed && styles.actionPressed,
                  ]}
                >
                  <Text style={[styles.actionText, u.is_active && !confirming && styles.actionTextOff]}>
                    {u.is_active ? (confirming ? 'Confirm' : 'Deactivate') : 'Activate'}
                  </Text>
                </Pressable>
              )}
            </Pressable>
          );
        })
      )}

      <Text style={styles.footnote}>
        Tap a user to edit their name, email, belt or role. Deactivated users are logged out straight away and can't sign in until you activate them again.
      </Text>
    </View>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, highlight && styles.statHighlight]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', paddingVertical: space(1), marginBottom: space(3) },
  backText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 16, marginTop: space(2), marginBottom: space(6) },
  stats: { flexDirection: 'row', gap: space(2), marginBottom: space(5) },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space(3),
    alignItems: 'center',
  },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  statHighlight: { color: colors.danger },
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  searchBox: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 48,
    justifyContent: 'center',
    marginBottom: space(3),
  },
  searchInput: { color: colors.text, fontSize: 16, paddingHorizontal: space(4), paddingVertical: space(3) },
  filters: { flexDirection: 'row', gap: space(2), marginBottom: space(4) },
  filter: {
    paddingHorizontal: space(4),
    paddingVertical: space(2),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterOn: { backgroundColor: colors.text, borderColor: colors.text },
  filterText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  filterTextOn: { color: colors.background },
  loading: { marginTop: space(8), alignItems: 'center' },
  empty: { color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: space(8) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    marginBottom: space(2),
  },
  rowInactive: { opacity: 0.75 },
  rowPressed: { backgroundColor: colors.surfaceRaised },
  belt: { width: 6, alignSelf: 'stretch', borderRadius: 3, marginRight: space(3), borderWidth: 1, borderColor: colors.border },
  rowText: { flex: 1, marginRight: space(3) },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  name: { color: colors.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  adminBadge: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  email: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  rankLine: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(2) },
  rankText: { color: colors.text, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  status: { fontSize: 12, fontWeight: '600', marginTop: space(1) },
  statusOn: { color: '#4CC38A' },
  statusOff: { color: colors.danger },
  you: { color: colors.textMuted, fontSize: 13, fontWeight: '600', paddingHorizontal: space(3) },
  action: {
    minWidth: 96,
    minHeight: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(3),
  },
  actionOff: { borderWidth: 1.5, borderColor: colors.border },
  actionConfirm: { backgroundColor: colors.accent },
  actionOn: { backgroundColor: '#1F7A4D' },
  actionPressed: { opacity: 0.75 },
  actionText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  actionTextOff: { color: colors.text },
  footnote: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: space(4) },
});
