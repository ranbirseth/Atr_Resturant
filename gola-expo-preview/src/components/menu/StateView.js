import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';

// Shared loading / error / empty states for the Menu & Categories module.
export default function StateView({ mode, message, onRetry }) {
  if (mode === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.message}>{message || 'Loading…'}</Text>
      </View>
    );
  }

  if (mode === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Could not load data</Text>
        <Text style={styles.message}>{message || 'Unknown error'}</Text>
        {onRetry ? (
          <Pressable style={styles.retry} onPress={onRetry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.message}>{message || 'Nothing here yet.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  message: {
    marginTop: SPACING.md,
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.danger,
    marginBottom: SPACING.xs,
  },
  retry: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
