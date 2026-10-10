import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';
import { statusLabel } from '../../utils/orderUtils';

export default function FilterChips({ options, value, onChange }) {
  const list = Array.isArray(options) ? options : [];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {list.map(function (option) {
        const active = option === value;
        const label = option === 'All' ? 'All' : statusLabel(option);
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: SPACING.sm,
  },
  chipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
  },
  chipTextActive: {
    color: '#ffffff',
  },
});
