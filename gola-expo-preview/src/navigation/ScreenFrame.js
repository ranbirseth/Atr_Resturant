import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '../theme';

// Every drawer screen is rendered inside this frame so its content is laid out
// above the Android navigation/gesture bar. The app is edge-to-edge on Android
// and React Navigation's drawer pads the header but not the screen body, so the
// last list row, and any control pinned to the bottom of a screen, used to be
// drawn underneath the system bar.
export default function ScreenFrame({ children }) {
  return (
    <SafeAreaView style={styles.frame} edges={['bottom']}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
