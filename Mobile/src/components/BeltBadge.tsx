import { StyleSheet, View } from 'react-native';
import { belts, colors } from '../theme';

export const MAX_STRIPES = 4;

type Size = 'sm' | 'md' | 'lg';

const DIMENSIONS: Record<Size, { width: number; height: number; bar: number; stripe: number; gap: number }> = {
  sm: { width: 40, height: 10, bar: 13, stripe: 1.5, gap: 1.5 },
  md: { width: 76, height: 16, bar: 24, stripe: 2.5, gap: 2.5 },
  lg: { width: 132, height: 24, bar: 40, stripe: 4, gap: 4 },
};

type Props = { belt: string; stripes?: number; size?: Size };

/**
 * A belt drawn like the real thing: the belt colour with a rank bar near the end,
 * carrying one white stripe per stripe earned. Black belts have a red rank bar.
 */
export function BeltBadge({ belt, stripes = 0, size = 'md' }: Props) {
  const d = DIMENSIONS[size];
  const count = Math.max(0, Math.min(MAX_STRIPES, Math.round(stripes)));
  const barColor = belt === 'Black' ? colors.accent : '#0B0B0D';

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={formatRank(belt, count)}
      style={[
        styles.belt,
        { width: d.width, height: d.height, backgroundColor: belts[belt] ?? belts.White, paddingRight: d.width * 0.1 },
      ]}
    >
      <View style={[styles.bar, { width: d.bar, backgroundColor: barColor, gap: d.gap }]}>
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={[styles.stripe, { width: d.stripe }]} />
        ))}
      </View>
    </View>
  );
}

/** "Blue belt", "Blue belt · 1 stripe", "Purple belt · 3 stripes". */
export function formatRank(belt: string | undefined, stripes: number | undefined): string {
  const b = `${belt ?? 'White'} belt`;
  const s = stripes ?? 0;
  return s > 0 ? `${b} · ${s} stripe${s === 1 ? '' : 's'}` : b;
}

const styles = StyleSheet.create({
  belt: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  bar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'stretch' },
  stripe: { backgroundColor: '#FFFFFF' },
});
