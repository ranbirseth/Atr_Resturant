import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Bottom safe-area inset (Android navigation/gesture bar) plus optional extra
// padding. The app renders edge-to-edge on Android, so scrollable content and
// any row pinned to the bottom of the screen or a modal must clear the system
// bar. On platforms or orientations without a bottom inset this is just `extra`.
//
// Usage: const pad = useBottomInset(SPACING.lg);
export function useBottomInset(extra = 0) {
  const insets = useSafeAreaInsets();
  const bottom = insets && typeof insets.bottom === 'number' ? insets.bottom : 0;
  return bottom + extra;
}
