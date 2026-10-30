import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { belts, colors } from '../theme';

const ORDER = ['White', 'Blue', 'Purple', 'Brown', 'Black'] as const;
const STEP_MS = 650; // time spent on each belt colour (hold + blend)
const SPIN_MS = 1200; // one full turn
const USE_NATIVE = Platform.OS !== 'web';

// Belt fabric colours. The black is lifted slightly so it reads on the dark background.
const FABRIC: Record<(typeof ORDER)[number], string> = {
  White: belts.White,
  Blue: belts.Blue,
  Purple: belts.Purple,
  Brown: belts.Brown,
  Black: '#24262C',
};
// Rank bar: black on coloured belts, red on a black belt.
const BAR: Record<(typeof ORDER)[number], string> = {
  White: '#0B0B0D',
  Blue: '#0B0B0D',
  Purple: '#0B0B0D',
  Brown: '#0B0B0D',
  Black: colors.accent,
};

// Colour timeline: hold each belt for most of its step, then blend into the next,
// ending on white again so the loop is seamless.
function timeline(palette: Record<(typeof ORDER)[number], string>) {
  const inputRange: number[] = [];
  const outputRange: string[] = [];
  ORDER.forEach((belt, i) => {
    inputRange.push(i, i + 0.7);
    outputRange.push(palette[belt], palette[belt]);
  });
  inputRange.push(ORDER.length);
  outputRange.push(palette.White);
  return { inputRange, outputRange };
}
const FABRIC_TL = timeline(FABRIC);
const BAR_TL = timeline(BAR);

type Props = { size?: number };

/** Loading indicator: a belt spinning in a circle, ranking up from white to black. */
export function BeltLoader({ size = 120 }: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const rank = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Rotation can run on the native thread; colours can't, so they use a separate value.
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: SPIN_MS, easing: Easing.linear, useNativeDriver: USE_NATIVE }),
    );
    const rankLoop = Animated.loop(
      Animated.timing(rank, {
        toValue: ORDER.length,
        duration: STEP_MS * ORDER.length,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    spinLoop.start();
    rankLoop.start();
    return () => {
      spinLoop.stop();
      rankLoop.stop();
    };
  }, [spin, rank]);

  const band = Math.max(8, Math.round(size * 0.17)); // belt width
  const barLength = Math.round(size * 0.26); // rank bar, measured along the belt (short enough to sit on the curve)
  const stripeWidth = Math.max(2, Math.round(size * 0.025));

  const fabric = rank.interpolate(FABRIC_TL);
  const bar = rank.interpolate(BAR_TL);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // A ring of the given inset that leaves the top quarter open (the gap between the belt's ends).
  const arc = (inset: number, width: number, color: Animated.AnimatedInterpolation<string>) => (
    <Animated.View
      style={{
        position: 'absolute',
        top: inset,
        left: inset,
        width: size - inset * 2,
        height: size - inset * 2,
        borderRadius: size,
        borderWidth: width,
        borderTopColor: 'transparent',
        borderRightColor: color,
        borderBottomColor: color,
        borderLeftColor: color,
      }}
    />
  );

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, transform: [{ rotate }] }}>
        {/* Belt fabric */}
        {arc(0, band, fabric)}

        {/* Rank bar with four white stripes, sitting across the belt at 9 o'clock */}
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            top: size / 2 - barLength / 2,
            width: band,
            height: barLength,
            backgroundColor: bar,
            borderRadius: 2,
            justifyContent: 'space-evenly',
            paddingVertical: Math.round(barLength * 0.1),
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ height: stripeWidth, backgroundColor: '#FFFFFF', marginHorizontal: 1 }} />
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
}
