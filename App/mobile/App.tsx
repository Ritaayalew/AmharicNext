import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import Animated, {
  cancelAnimation,
  FadeIn,
  interpolateColor,
  Keyframe,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
// Import single weights so only these two font files are bundled (not all nine).
import { NotoSansEthiopic_400Regular } from '@expo-google-fonts/noto-sans-ethiopic/400Regular';
import { NotoSansEthiopic_600SemiBold } from '@expo-google-fonts/noto-sans-ethiopic/600SemiBold';
import { ChipSkeleton, SuggestionChip } from './SuggestionChip';
import { chip, Colors, motion, radius, space, type, useColors } from './theme';

// Set in .env (see .env.example). A phone cannot use "localhost": use the laptop's LAN IP.
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const DEBOUNCE_MS = 150;
const TIMEOUT_MS = 5000;
const SLOTS = [0, 1, 2, 3, 4];

type Suggestion = { word: string; prob: number; order: number };

// The chosen word floats up from the chips towards the text and fades out.
const flyIntoText = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
  100: { opacity: 0, transform: [{ translateY: -72 }, { scale: 0.9 }], easing: motion.easing },
}).duration(motion.duration.slow);

export default function App() {
  const [fontsLoaded] = useFonts({ NotoSansEthiopic_400Regular, NotoSansEthiopic_600SemiBold });
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [retry, setRetry] = useState(0);
  const [flying, setFlying] = useState<{ word: string; id: number; slot: number } | null>(null);
  const glow = useSharedValue(0);

  // Ask the server for suggestions 150 ms after the last change to the text.
  // Every new keystroke clears the timer and aborts the previous request, so only
  // the newest text ever updates the chips.
  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(async () => {
      setLoading(true);
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, TIMEOUT_MS);
      try {
        const res = await fetch(`${API_URL}/v1/suggest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, k: 5 }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSuggestions(data.suggestions);
        setOffline(false);
        setLoading(false);
      } catch {
        // An abort caused by newer typing is expected; anything else means no server.
        if (timedOut || !controller.signal.aborted) {
          setOffline(true);
          setLoading(false);
        }
      } finally {
        clearTimeout(timeout);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [text, retry]);

  function addWord(word: string, slot: number) {
    setText((t) => (t === '' || t.endsWith(' ') ? t : t + ' ') + word + ' ');
    // Briefly tint the composer border so the eye follows the word into the text.
    glow.value = withSequence(
      withTiming(1, { duration: motion.duration.fast }),
      withTiming(0, { duration: motion.duration.slow, easing: motion.easing }),
    );
    if (!reduceMotion) {
      const id = Date.now();
      setFlying({ word, id, slot });
      setTimeout(() => setFlying((f) => (f?.id === id ? null : f)), motion.duration.slow);
    }
  }

  const composerStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(glow.value, [0, 1], [colors.border, colors.accent]),
  }));

  if (!fontsLoaded) return null;

  // Skeletons only when there is nothing to show yet; later updates cross-fade instead.
  const showSkeleton = loading && suggestions.length === 0 && !offline;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[colors.accentSoft, colors.background]} style={styles.wash} />
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[type.title, { color: colors.text }]}>AmharicNext</Text>
          <Text style={[type.subtitle, { color: colors.muted }]}>Next-word suggestions for Amharic</Text>
          <Ornament colors={colors} />
        </View>

        <Animated.View style={[styles.composerCard, { backgroundColor: colors.surface }, composerStyle]}>
          <TextInput
            style={[styles.composer, type.composer, { color: colors.text }]}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            placeholder="መጻፍ ይጀምሩ…"
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            accessibilityLabel="Amharic text"
            autoFocus
          />
          <Pressable
            style={[styles.clear, { backgroundColor: colors.accentSoft, opacity: text ? 1 : 0.4 }]}
            onPress={() => setText('')}
            disabled={!text}
            accessibilityRole="button"
            accessibilityLabel="Clear text"
          >
            <Text style={[type.caption, styles.clearText, { color: colors.accent }]}>Clear</Text>
          </Pressable>
        </Animated.View>

        <EmptyHint visible={text.trim() === '' && !offline} colors={colors} reduceMotion={reduceMotion} />

        {offline ? (
          <Animated.View
            entering={FadeIn.duration(motion.duration.base)}
            style={[styles.offline, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[type.body, { color: colors.text }]}>Can't reach the server. Same Wi-Fi?</Text>
            <Pressable
              style={[styles.retry, { backgroundColor: colors.accent }]}
              onPress={() => {
                setOffline(false);
                setRetry((r) => r + 1);
              }}
              accessibilityRole="button"
            >
              <Text style={[type.body, { color: colors.surface }]}>Retry</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
              keyboardShouldPersistTaps="handled"
            >
              {SLOTS.map((i) => {
                const s = suggestions[i];
                return (
                  <View key={i} style={styles.slot}>
                    {showSkeleton ? (
                      <ChipSkeleton colors={colors} />
                    ) : s ? (
                      <SuggestionChip key={s.word} {...s} index={i} colors={colors} onPress={(w) => addWord(w, i)} />
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
            {flying && (
              <Animated.Text
                key={flying.id}
                entering={flyIntoText}
                pointerEvents="none"
                style={[
                  styles.flying,
                  type.chip,
                  { left: flying.slot * (chip.width + space.sm), color: colors.accent, backgroundColor: colors.accentSoft },
                ]}
              >
                {flying.word}
              </Animated.Text>
            )}
          </View>
        )}
      </ScrollView>
      <StatusBar style="auto" />
    </View>
  );
}

// A friendly first-launch line; the little marker gently bobs towards the chips.
// It stays mounted and only fades, so the chips below never jump when it hides.
function EmptyHint({ visible, colors, reduceMotion }: { visible: boolean; colors: Colors; reduceMotion: boolean }) {
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: motion.duration.base, easing: motion.easing });
    if (visible && !reduceMotion) {
      const half = motion.duration.float / 2;
      y.value = withRepeat(
        withSequence(withTiming(4, { duration: half, easing: motion.easing }), withTiming(0, { duration: half, easing: motion.easing })),
        -1,
      );
    } else {
      cancelAnimation(y);
    }
    return () => cancelAnimation(y);
  }, [visible, reduceMotion]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Animated.View style={[styles.hint, fade]} pointerEvents="none" accessibilityElementsHidden={!visible}>
      <Text style={[type.body, styles.hintText, { color: colors.muted }]}>
        Type in Amharic, or tap a word below to start a sentence.
      </Text>
      <Animated.Text style={[type.body, { color: colors.accent }, bob]}>↓</Animated.Text>
    </Animated.View>
  );
}

// A small row of diamonds, a quiet nod to woven tibeb borders.
function Ornament({ colors }: { colors: Colors }) {
  return (
    <View style={styles.ornament} accessible={false}>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <View
          key={i}
          style={[styles.diamond, { backgroundColor: i % 2 ? colors.accentSoft : colors.accent, opacity: i === 3 ? 1 : 0.55 }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 260 },
  screen: { padding: space.xl, paddingTop: 64, gap: space.lg },
  header: { gap: space.xs, marginBottom: space.sm },
  ornament: { flexDirection: 'row', gap: space.sm, marginTop: space.md, alignItems: 'center' },
  diamond: { width: 7, height: 7, transform: [{ rotate: '45deg' }], borderRadius: 1.5 },
  composerCard: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: space.lg,
    paddingBottom: space.md,
    gap: space.sm,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  composer: { minHeight: 132, textAlignVertical: 'top', padding: 0 },
  clear: { alignSelf: 'flex-end', borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm },
  clearText: { fontSize: 14 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  hintText: { flexShrink: 1 },
  row: { gap: space.sm, paddingVertical: space.xs },
  slot: { width: chip.width, height: chip.height },
  flying: {
    position: 'absolute',
    top: space.xs,
    overflow: 'hidden',
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  offline: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.md, alignItems: 'flex-start' },
  retry: { borderRadius: radius.pill, paddingHorizontal: space.xl, paddingVertical: space.sm },
});
