import { memo } from 'react';
import Svg, { Circle, G, Path, Polygon, Polyline } from 'react-native-svg';
import { useTheme } from '../ThemeContext';
import { POSES, iconFor, type Figure, type PoseId } from '../sessions/techniqueIcons';
import type { Category, Position } from '../sessions/types';

const YOU = '#C8102E';

type Props = {
  /** Show the icon for this technique... */
  technique?: { name: string; category: Category; position?: Position };
  /** ...or a specific pose. */
  pose?: PoseId;
  /** Height in points (width is 4:3). */
  size?: number;
  /** It was done to you: swap colours so you (red) are on the receiving end. */
  received?: boolean;
};

function Person({ f, color }: { f: Figure; color: string }) {
  const pts = (...p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <>
      <Polyline points={pts(f.neck, f.hip)} stroke={color} />
      {f.arms.map(([elbow, hand], i) => (
        <Polyline key={`a${i}`} points={pts(f.neck, elbow, hand)} stroke={color} />
      ))}
      {f.legs.map(([knee, foot], i) => (
        <Polyline key={`l${i}`} points={pts(f.hip, knee, foot)} stroke={color} />
      ))}
      <Circle cx={f.head[0]} cy={f.head[1]} r={4.2} fill={color} stroke="none" />
    </>
  );
}

/** A little stick-figure picture of a technique: you in red, your partner in grey. */
export const TechniqueIcon = memo(function TechniqueIcon({ technique, pose, size = 24, received }: Props) {
  const { colors } = useTheme();
  const id = pose ?? (technique ? iconFor(technique) : 'guard');
  const p = POSES[id];
  return (
    <Svg width={(size * 64) / 48} height={size} viewBox="0 0 64 48" accessibilityElementsHidden importantForAccessibility="no">
      {/* Shared line style for both figures */}
      <G fill="none" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <Person f={p.partner} color={received ? YOU : colors.textMuted} />
        <Person f={p.you} color={received ? colors.textMuted : YOU} />
        {'arrow' in p && p.arrow ? (
          <>
            <Path d={p.arrow} stroke={colors.text} strokeWidth={2} strokeDasharray="3 3" />
            <Polygon points={p.arrowHead!.map(([x, y]) => `${x},${y}`).join(' ')} fill={colors.text} stroke="none" />
          </>
        ) : null}
      </G>
    </Svg>
  );
});
