import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {COLORS, RADIUS, SPACING} from '../../theme';
import {filterLowStockAlerts} from '../../utils/dashboardMetrics';
import {formatPercent, formatQty} from '../../utils/inventoryUtils';

export default function LowStockAlerts({alerts}) {
  const low = filterLowStockAlerts(alerts);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Low Stock Alerts</Text>
      <Text style={styles.subtitle}>Active items at or below 30% remaining</Text>

      {low.length === 0 ? (
        <Text style={styles.empty}>No low-stock items right now.</Text>
      ) : (
        low.map(function (item, index) {
          const remaining = formatPercent(item.remainingPercent);
          const quantity = formatQty(item.currentQty, item.unit);
          return (
            <View
              key={item.name + '-' + index}
              style={[
                styles.row,
                index === low.length - 1 ? styles.lastRow : null,
              ]}>
              <View style={styles.nameWrap}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.qty}>{quantity} left</Text>
              </View>
              <Text style={styles.remaining}>{remaining}</Text>
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
  empty: {
    marginTop: SPACING.md,
    fontSize: 13,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  nameWrap: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  qty: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.muted,
  },
  remaining: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.danger,
  },
});