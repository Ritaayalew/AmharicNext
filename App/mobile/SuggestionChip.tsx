import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { chip, Colors, motion, radius, space, type } from './theme';

export function percent(prob: number) {
  const p = Math.round(prob * 100);
  return p < 1 ? '<1%' : `${p}%`;
}

type Props = {
  word: string;
  prob: number;
  index: number; // position in the row, used for the entrance stagger
  colors: Colors;
  onPress: (word: string) => void;
};

// One suggestion. It fills a fixed-size slot: a new word springs in while the
// old one fades out on top of it, so the row never changes size.
export function SuggestionChip({ word, prob, index, colors, onPress }: Props) {
  const scale = useSharedValue(1);
  const fill = useSharedValue(0);

  // Probability bar grows from 0 to the value (and re-animates if it changes).
  useEffect(() => {
    fill.value = withDelay(
      index * motion.stagger,
      withTiming(Math.max(prob, 0.02), { duration: motion.duration.slow, easing: motion.easing }),
    );
  }, [prob]);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const barStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <Animated.View
      style={StyleSheet.absoluteFill}
      entering={FadeInDown.delay(index * motion.stagger).springify()
        .damping(motion.spring.damping).stiffness(motion.spring.stiffness).mass(motion.spring.mass)}
      exiting={FadeOut.duration(motion.duration.fast)}
    >
      <Pressable
        style={styles.fill}
        onPressIn={() => (scale.value = withSpring(motion.pressScale, motion.spring))}
        onPressOut={() => (scale.value = withSpring(1, motion.spring))}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress(word);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Add ${word}, ${percent(prob)}`}
      >
        <Animated.View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressStyle]}>
          <Text style={[type.chip, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {word}
          </Text>
          <View style={styles.meter}>
            <View style={[styles.track, { backgroundColor: colors.accentSoft }]}>
              <Animated.View style={[styles.bar, { backgroundColor: colors.accent }, barStyle]} />
            </View>
            <Text style={[type.caption, { color: colors.muted }]}>{percent(prob)}</Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// Placeholder shown while the first suggestions load: a soft band sweeps across.
export function ChipSkeleton({ colors }: { colors: Colors }) {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(-1);

  useEffect(() => {
    if (!reduceMotion) {
      x.value = withRepeat(withTiming(1, { duration: motion.duration.shimmer, easing: motion.easing }), -1);
    }
    return () => cancelAnimation(x);
  }, [reduceMotion]);

  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * chip.width }] }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.card, styles.skeleton, { backgroundColor: colors.skeleton }]}
      entering={FadeIn.duration(motion.duration.fast)}
      exiting={FadeOut.duration(motion.duration.fast)}
      accessibilityLabel="Loading suggestions"
    >
      <View style={[styles.skeletonWord, { backgroundColor: colors.border }]} />
      <View style={[styles.skeletonBar, { backgroundColor: colors.border }]} />
      <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
        <LinearGradient
          colors={['transparent', colors.shimmer, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.fill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    justifyContent: 'space-between',
  },
  meter: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { flex: 1, height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: radius.pill },
  skeleton: { borderColor: 'transparent', overflow: 'hidden', paddingVertical: space.md },
  skeletonWord: { width: '70%', height: 18, borderRadius: radius.sm },
  skeletonBar: { width: '55%', height: 4, borderRadius: radius.pill },
});
