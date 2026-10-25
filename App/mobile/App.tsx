import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
// Import single weights so only these two font files are bundled (not all nine).
import { NotoSansEthiopic_400Regular } from '@expo-google-fonts/noto-sans-ethiopic/400Regular';
import { NotoSansEthiopic_600SemiBold } from '@expo-google-fonts/noto-sans-ethiopic/600SemiBold';

// Set in .env (see .env.example). A phone cannot use "localhost": use the laptop's LAN IP.
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const DEBOUNCE_MS = 150;
const TIMEOUT_MS = 5000;

type Suggestion = { word: string; prob: number; order: number };

function percent(prob: number) {
  const p = Math.round(prob * 100);
  return p < 1 ? '<1%' : `${p}%`;
}

export default function App() {
  const [fontsLoaded] = useFonts({ NotoSansEthiopic_400Regular, NotoSansEthiopic_600SemiBold });
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [offline, setOffline] = useState(false);
  const [retry, setRetry] = useState(0);

  // Ask the server for suggestions 150 ms after the last change to the text.
  // Every new keystroke clears the timer and aborts the previous request, so only
  // the newest text ever updates the chips.
  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(async () => {
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
      } catch {
        // An abort caused by newer typing is expected; anything else means no server.
        if (timedOut || !controller.signal.aborted) setOffline(true);
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

  function addWord(word: string) {
    setText((t) => (t === '' || t.endsWith(' ') ? t : t + ' ') + word + ' ');
  }

  if (!fontsLoaded) return null;

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>AmharicNext</Text>

      <TextInput
        style={styles.composer}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={500}
        placeholder="መጻፍ ይጀምሩ…"
        placeholderTextColor="#8a8a8a"
        accessibilityLabel="Amharic text"
        autoFocus
      />

      {offline ? (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>Can't reach the server. Same Wi-Fi?</Text>
          <Pressable style={styles.button} onPress={() => setRetry((r) => r + 1)} accessibilityRole="button">
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.chips}>
          {suggestions.map((s) => (
            <Pressable
              key={s.word}
              style={styles.chip}
              onPress={() => addWord(s.word)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${s.word}, ${percent(s.prob)}`}
            >
              <Text style={styles.chipWord}>{s.word}</Text>
              <Text style={styles.chipProb}>{percent(s.prob)}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable
        style={[styles.button, styles.clear]}
        onPress={() => setText('')}
        accessibilityRole="button"
        accessibilityLabel="Clear text"
      >
        <Text style={styles.buttonText}>Clear</Text>
      </Pressable>

      <StatusBar style="dark" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: '#fafaf7', padding: 16, paddingTop: 56 },
  title: { fontSize: 22, fontFamily: 'NotoSansEthiopic_600SemiBold', color: '#1d1d1b', marginBottom: 12 },
  composer: {
    minHeight: 140,
    fontSize: 22,
    lineHeight: 34,
    fontFamily: 'NotoSansEthiopic_400Regular',
    color: '#1d1d1b',
    backgroundColor: '#ffffff',
    borderColor: '#dcdcd5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, minHeight: 48 },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    backgroundColor: '#ffffff',
    borderColor: '#d9c9b0',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipWord: { fontSize: 18, fontFamily: 'NotoSansEthiopic_400Regular', color: '#1d1d1b' },
  chipProb: { fontSize: 13, color: '#6b6b66' },
  offline: { marginTop: 12, gap: 8, alignItems: 'flex-start' },
  offlineText: { fontSize: 16, color: '#7a3e00' },
  button: { backgroundColor: '#1d1d1b', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 },
  buttonText: { color: '#ffffff', fontSize: 16 },
  clear: { alignSelf: 'flex-start', marginTop: 20 },
});
