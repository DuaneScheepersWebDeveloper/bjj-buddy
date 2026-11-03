import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { radius, space } from '../theme';
import { makeStyles, useTheme } from '../ThemeContext';
import {
  CATEGORY_LABEL,
  CATEGORY_ONE,
  POSITION_LABEL,
  POSITIONS,
  type Category,
  type Entry,
  type Position,
  type Result,
  type Technique,
} from '../sessions/types';

const MAX_COUNT = 50;
// Suggestions shown before tapping "Show more" (your most-used first).
const SHOW_FIRST = 5;

type Props = {
  library: Technique[];
  /** Which kinds of technique this picker is for, e.g. ['submission']. */
  categories: Category[];
  /** hit = you did it; conceded = it was done to you. */
  result: Result;
  /** All entries in the session; the picker only shows and changes its own kind. */
  entries: Entry[];
  onChange: (entries: Entry[]) => void;
  /** Colour for selected techniques and counters. */
  accent: string;
  /** Shown when nothing is picked yet. */
  emptyText: string;
  /** How often you've logged each technique (lower-case name -> times), so your usual ones come first. */
  usage?: Record<string, number>;
};

const mine = (e: Entry, categories: Category[], result: Result) =>
  e.result === result && categories.includes(e.category);

/**
 * Pick techniques and how many times: search or filter by position (standing / top / bottom),
 * tap to add, then use − / + to change the count. Anything not in the library can be added by name.
 */
export function TechniquePicker({ library, categories, result, entries, onChange, accent, emptyText, usage }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<Position | 'all'>('all');
  const [category, setCategory] = useState<Category | 'all'>(categories.length === 1 ? categories[0] : 'all');
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState<Category>(categories[0]);
  const [newPosition, setNewPosition] = useState<Position | null>(null);

  const selected = entries.filter((e) => mine(e, categories, result));
  const countOf = (name: string) =>
    selected.find((e) => e.name.toLowerCase() === name.toLowerCase())?.count ?? 0;

  const term = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      library.filter(
        (t) =>
          categories.includes(t.category) &&
          (category === 'all' || t.category === category) &&
          (position === 'all' || t.position === position) &&
          (!term || t.name.toLowerCase().includes(term)),
      ),
    [library, categories, category, position, term],
  );
  const exact = term && library.some((t) => categories.includes(t.category) && t.name.toLowerCase() === term);
  // Collapsed: your 5 most-used (not already picked), topped up from the library in its usual order.
  const suggestions = useMemo(() => {
    const picked = new Set(selected.map((e) => e.name.toLowerCase()));
    const order = new Map(matches.map((t, i) => [t, i]));
    return matches
      .filter((t) => !picked.has(t.name.toLowerCase()))
      .sort((a, b) => (usage?.[b.name.toLowerCase()] ?? 0) - (usage?.[a.name.toLowerCase()] ?? 0) || order.get(a)! - order.get(b)!)
      .slice(0, SHOW_FIRST);
  }, [matches, selected, usage]);
  const expanded = showAll || !!term;
  const visible = expanded ? matches : suggestions;

  function setCount(t: Pick<Entry, 'name' | 'category' | 'position' | 'technique_id'>, count: number) {
    const others = entries.filter((e) => !(mine(e, categories, result) && e.name.toLowerCase() === t.name.toLowerCase()));
    if (count <= 0) return onChange(others);
    const existing = selected.find((e) => e.name.toLowerCase() === t.name.toLowerCase());
    const next: Entry = existing
      ? { ...existing, count: Math.min(MAX_COUNT, count) }
      : {
          name: t.name,
          category: t.category,
          position: t.position,
          technique_id: t.technique_id ?? null,
          result,
          count: Math.min(MAX_COUNT, count),
        };
    // Keep the order the user picked them in.
    const at = entries.indexOf(existing as Entry);
    if (at >= 0) onChange(entries.map((e, i) => (i === at ? next : e)));
    else onChange([...others, next]);
  }

  const addOne = (t: Technique) => setCount({ ...t, technique_id: t.id ?? null }, countOf(t.name) + 1);

  function addCustom() {
    const name = search.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name || !newPosition) return;
    setCount({ name, category: newCategory, position: newPosition, technique_id: null }, countOf(name) + 1);
    setSearch('');
    setAdding(false);
    setNewPosition(null);
  }

  return (
    <View>
      {/* What you've picked, with counters */}
      {selected.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <View style={styles.selectedList}>
          {selected.map((e) => (
            <View key={e.name} style={styles.selectedRow}>
              <View style={styles.selectedText}>
                <Text style={styles.selectedName} numberOfLines={2}>{e.name}</Text>
                <Text style={styles.selectedMeta}>
                  {CATEGORY_ONE[e.category]} · {POSITION_LABEL[e.position]}
                </Text>
              </View>
              <View style={styles.counter}>
                <Pressable
                  onPress={() => setCount(e, e.count - 1)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={e.count === 1 ? `Remove ${e.name}` : `One less ${e.name}`}
                  style={({ pressed }) => [styles.countBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.countBtnText}>{e.count === 1 ? '×' : '−'}</Text>
                </Pressable>
                <Text style={[styles.countNum, { color: accent }]} accessibilityLabel={`${e.count} times`}>
                  {e.count}
                </Text>
                <Pressable
                  onPress={() => setCount(e, e.count + 1)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`One more ${e.name}`}
                  style={({ pressed }) => [styles.countBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.countBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Find and add */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={search}
          onChangeText={(t) => {
            setSearch(t);
            setAdding(false);
          }}
          placeholder="Search or type a technique"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          autoCorrect={false}
          style={styles.searchInput}
          returnKeyType="done"
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={styles.clear}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {showAll && categories.length > 1 ? (
        <View style={styles.filterRow}>
          {(['all', ...categories] as const).map((c) => (
            <FilterChip
              key={c}
              label={c === 'all' ? 'All' : CATEGORY_LABEL[c]}
              on={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </View>
      ) : null}
      {showAll ? (
        <View style={styles.filterRow}>
          {(['all', ...POSITIONS] as const).map((p) => (
            <FilterChip
              key={p}
              label={p === 'all' ? 'Any position' : POSITION_LABEL[p]}
              on={position === p}
              onPress={() => setPosition(p)}
              subtle
            />
          ))}
        </View>
      ) : null}

      <View style={styles.chips}>
        {visible.map((t) => {
          const n = countOf(t.name);
          return (
            <Pressable
              key={`${t.category}:${t.name}`}
              onPress={() => addOne(t)}
              accessibilityRole="button"
              accessibilityLabel={n ? `${t.name}, ${n} so far. Tap to add one more` : `Add ${t.name}`}
              style={({ pressed }) => [
                styles.chip,
                n > 0 && { borderColor: accent, backgroundColor: accent + '22' },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.chipText, n > 0 && { color: colors.text }]}>
                {n > 0 ? `${t.name} ×${n}` : `+ ${t.name}`}
              </Text>
            </Pressable>
          );
        })}
        {visible.length === 0 && !term ? <Text style={styles.empty}>Nothing here. Try another filter.</Text> : null}
      </View>

      {!term ? (
        <Pressable
          onPress={() => {
            setShowAll((s) => !s);
            // Back to the short list: clear the filters too.
            if (showAll) {
              setPosition('all');
              setCategory(categories.length === 1 ? categories[0] : 'all');
            }
          }}
          hitSlop={8}
          accessibilityRole="button"
          style={styles.more}
        >
          <Text style={styles.moreText}>{showAll ? 'Show fewer' : 'Show more and filter by position'}</Text>
        </Pressable>
      ) : null}

      {/* Not in the list? Add it by name. */}
      {term && !exact ? (
        adding ? (
          <View style={styles.addBox}>
            <Text style={styles.addTitle}>Add “{search.trim()}”</Text>
            {categories.length > 1 ? (
              <>
                <Text style={styles.addLabel}>What is it?</Text>
                <View style={styles.filterRow}>
                  {categories.map((c) => (
                    <FilterChip key={c} label={CATEGORY_ONE[c]} on={newCategory === c} onPress={() => setNewCategory(c)} />
                  ))}
                </View>
              </>
            ) : null}
            <Text style={styles.addLabel}>Where were you?</Text>
            <View style={styles.filterRow}>
              {POSITIONS.map((p) => (
                <FilterChip key={p} label={POSITION_LABEL[p]} on={newPosition === p} onPress={() => setNewPosition(p)} />
              ))}
            </View>
            <View style={styles.addActions}>
              <Pressable onPress={() => setAdding(false)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.moreText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={addCustom}
                disabled={!newPosition}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.addBtn,
                  { backgroundColor: accent },
                  (!newPosition || pressed) && styles.dim,
                ]}
              >
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setAdding(true);
              setNewCategory(category === 'all' ? categories[0] : category);
              setNewPosition(position === 'all' ? null : position);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.chip, styles.newChip, pressed && styles.pressed]}
          >
            <Text style={styles.chipText}>+ Add “{search.trim()}”</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

function FilterChip({ label, on, onPress, subtle }: { label: string; on: boolean; onPress: () => void; subtle?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.filter, subtle && styles.filterSubtle, on && styles.filterOn]}
    >
      <Text style={[styles.filterText, on && styles.filterTextOn]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  empty: { color: colors.textMuted, fontSize: 14, marginBottom: space(3) },
  selectedList: { marginBottom: space(3), gap: space(2) },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingVertical: space(2),
    paddingLeft: space(3),
    paddingRight: space(2),
  },
  selectedText: { flex: 1 },
  selectedName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  selectedMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  countBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnText: { color: colors.text, fontSize: 18, fontWeight: '700', lineHeight: 20 },
  countNum: { fontSize: 18, fontWeight: '900', minWidth: 22, textAlign: 'center' },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.45 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    minHeight: 46,
    marginBottom: space(3),
  },
  searchIcon: { color: colors.textMuted, fontSize: 18, marginRight: space(2) },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: space(2) },
  clear: { color: colors.textMuted, fontSize: 22, paddingHorizontal: space(1) },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginBottom: space(3) },
  filter: {
    paddingHorizontal: space(3),
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  filterSubtle: { paddingVertical: 4 },
  filterOn: { backgroundColor: colors.text, borderColor: colors.text },
  filterText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  filterTextOn: { color: colors.background },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: {
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  newChip: { alignSelf: 'flex-start', marginTop: space(3), borderStyle: 'dashed' },
  chipText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  more: { alignSelf: 'flex-start', marginTop: space(3), paddingVertical: space(1) },
  moreText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  addBox: {
    marginTop: space(3),
    padding: space(4),
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: space(3) },
  addLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: space(2) },
  addActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space(5) },
  addBtn: { paddingHorizontal: space(5), paddingVertical: space(2), borderRadius: radius.sm },
  addBtnText: { color: colors.white, fontSize: 14, fontWeight: '800' },
}));
