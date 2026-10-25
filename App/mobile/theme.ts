// Design tokens for AmharicNext: colours, spacing, type and motion, defined once.
import { useColorScheme } from 'react-native';
import { Easing } from 'react-native-reanimated';

// Warm paper neutrals with one accent: a roasted-coffee terracotta.
const light = {
  background: '#F6F1E9',
  surface: '#FFFDF9',
  text: '#211C17',
  muted: '#6F665B',
  border: '#E6DCCD',
  accent: '#B9542A',
  accentSoft: '#F2DFD2',
  skeleton: '#ECE3D6',
  shimmer: 'rgba(255,255,255,0.65)',
};

const dark: typeof light = {
  background: '#14110E',
  surface: '#1F1A16',
  text: '#F3EDE5',
  muted: '#A69C90',
  border: '#352D26',
  accent: '#E8875A',
  accentSoft: '#3A261B',
  skeleton: '#2A231E',
  shimmer: 'rgba(255,255,255,0.08)',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

export const font = {
  regular: 'NotoSansEthiopic_400Regular',
  semibold: 'NotoSansEthiopic_600SemiBold',
};
export const type = {
  title: { fontFamily: font.semibold, fontSize: 26 },
  subtitle: { fontFamily: font.regular, fontSize: 14 },
  composer: { fontFamily: font.regular, fontSize: 26, lineHeight: 42 },
  chip: { fontFamily: font.semibold, fontSize: 20 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: font.regular, fontSize: 12 },
};

// Motion: every animation in the app takes its timing from here.
export const motion = {
  duration: { fast: 140, base: 240, slow: 420, shimmer: 1300, float: 2000 },
  easing: Easing.bezier(0.2, 0, 0, 1), // quick start, soft landing
  spring: { damping: 16, stiffness: 180, mass: 0.9 },
  stagger: 45, // ms between consecutive chips
  pressScale: 0.94,
};

// Suggestion slots have a fixed size, so chips can cross-fade without moving the layout.
export const chip = { width: 132, height: 72 };
