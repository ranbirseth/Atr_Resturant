import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import InventoryScreen from '../Inventory/InventoryScreen';
import StockScreen from '../Stock/StockScreen';
import { COLORS, RADIUS, SPACING } from '../../theme';

const SECTIONS = [
  { key: 'inventory', label: 'Inventory' },
  { key: 'stock', label: 'Current Stock' },
];

// Inventory & Stock is one drawer destination with two in-screen sections
// (no bottom tabs): Inventory (record purchases) and Current Stock (consume /
// restock). Kept intentionally minimal.
export default function InventoryStockScreen() {
  const [section, setSection] = useState('inventory');

  return (
    <View style={styles.container}>
      <View style={styles.segment}>
        {SECTIONS.map(function (entry) {
          const active = section === entry.key;
          return (
            <Pressable
              key={entry.key}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
              onPress={() => setSection(entry.key)}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        {section === 'inventory' ? <InventoryScreen /> : null}
        {section === 'stock' ? <StockScreen /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  segment: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentItemActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.muted,
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  body: {
    flex: 1,
  },
});