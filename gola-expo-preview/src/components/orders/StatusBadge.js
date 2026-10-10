import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RADIUS, SPACING } from '../../theme';
import { statusLabel, statusStyle } from '../../utils/orderUtils';

export default function StatusBadge({ status, size }) {
  const palette = statusStyle(status);
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        isSmall ? styles.badgeSm : styles.badgeMd,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}>
      <Text
        style={[styles.text, isSmall ? styles.textSm : styles.textMd, { color: palette.fg }]}
        numberOfLines={1}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  badgeMd: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  text: {
    fontWeight: '700',
  },
  textSm: {
    fontSize: 11,
  },
  textMd: {
    fontSize: 13,
  },
});
