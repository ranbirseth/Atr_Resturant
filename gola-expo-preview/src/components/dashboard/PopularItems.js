import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {COLORS, RADIUS, SPACING} from '../../theme';
import {formatCurrency, formatNumber} from '../../utils/dashboardMetrics';

// Top items table built from native Views (no HTML <table>).
// Growth column removed: the API provides no growth data.
export default function PopularItems({items}) {
  const safe = Array.isArray(items) ? items : [];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Popular Items</Text>
      <Text style={styles.subtitle}>Top 5 by quantity sold</Text>

      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.itemCol]}>Item</Text>
        <Text style={[styles.headerCell, styles.qtyCol]}>Qty</Text>
        <Text style={[styles.headerCell, styles.revCol]}>Revenue</Text>
      </View>

      {safe.length === 0 ? (
        <Text style={styles.empty}>No items sold yet.</Text>
      ) : (
        safe.map(function (item, index) {
          return (
            <View
              key={item.name + '-' + index}
              style={[
                styles.row,
                index === safe.length - 1 ? styles.lastRow : null,
              ]}>
              <Text style={[styles.cell, styles.itemCol]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.cell, styles.qtyCol]}>
                {formatNumber(item.quantitySold)}
              </Text>
              <Text style={[styles.cell, styles.revCol]}>
                {formatCurrency(item.revenue)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.muted,
  },
  headerRow: {
    flexDirection: 'row',
    marginTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerCell: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  cell: {
    fontSize: 14,
    color: COLORS.text,
  },
  itemCol: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  qtyCol: {
    width: 56,
    textAlign: 'right',
  },
  revCol: {
    width: 100,
    textAlign: 'right',
    fontWeight: '600',
  },
  empty: {
    marginTop: SPACING.md,
    fontSize: 13,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
});
