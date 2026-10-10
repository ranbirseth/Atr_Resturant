import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {COLORS, RADIUS, SPACING} from '../../theme';

export default function StatCard({label, value, accent, hint, style}) {
  return (
    <View style={[styles.card, style]}>
      <View style={[styles.accent, {backgroundColor: accent || COLORS.accent}]} />
      <View style={styles.body}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {hint ? (
          <Text style={styles.hint} numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    minHeight: 104,
    // Android elevation + subtle iOS shadow.
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
  },
  accent: {
    width: 4,
    borderRadius: 2,
    marginRight: SPACING.md,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: {
    marginTop: SPACING.xs,
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
  },
  hint: {
    marginTop: SPACING.xs,
    fontSize: 11,
    color: COLORS.muted,
  },
});
