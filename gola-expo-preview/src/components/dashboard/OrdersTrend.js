import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {COLORS, RADIUS, SPACING} from '../../theme';
import {formatCurrency, populatedTrendHours, toNumber} from '../../utils/dashboardMetrics';

const MAX_BAR_HEIGHT = 120;
// Fixed column width keeps hour labels legible on a narrow phone while the
// horizontal scroll handles a busy day; flexGrow spreads a few columns out.
const COLUMN_WIDTH = 42;

export default function OrdersTrend({data}) {
  const hours = populatedTrendHours(data);
  const maxCount = hours.reduce(function (max, hour) {
    return Math.max(max, toNumber(hour && hour.count));
  }, 0);
  const totalOrders = hours.reduce(function (sum, hour) {
    return sum + toNumber(hour && hour.count);
  }, 0);
  const totalRevenue = hours.reduce(function (sum, hour) {
    return sum + toNumber(hour && hour.revenue);
  }, 0);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Today&apos;s Trend</Text>
      <Text style={styles.subtitle}>Orders &amp; revenue by hour (IST)</Text>

      {hours.length === 0 ? (
        <Text style={styles.empty}>No orders today yet.</Text>
      ) : (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>
              {formatCurrency(totalRevenue)} revenue
            </Text>
            <Text style={styles.summaryText}>{totalOrders} orders</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chart}>
            {hours.map(function (hour) {
              const count = toNumber(hour && hour.count);
              const ratio = maxCount > 0 ? count / maxCount : 0;
              const height = Math.max(0, ratio * MAX_BAR_HEIGHT);
              return (
                <View key={hour.key} style={styles.column}>
                  <Text style={styles.count}>{count}</Text>
                  <View style={styles.track}>
                    <View style={[styles.bar, {height: height}]} />
                  </View>
                  <Text style={styles.hourLabel}>{hour.label}</Text>
                </View>
              );
            })}
          </ScrollView>
        </>
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accent,
  },
  empty: {
    marginTop: SPACING.md,
    fontSize: 13,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
  chart: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexGrow: 1,
    justifyContent: 'space-around',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  column: {
    width: COLUMN_WIDTH,
    alignItems: 'center',
  },
  count: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  track: {
    height: MAX_BAR_HEIGHT,
    width: '62%',
    justifyContent: 'flex-end',
    backgroundColor: COLORS.barTrack,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    backgroundColor: COLORS.bar,
    borderRadius: RADIUS.sm,
  },
  hourLabel: {
    marginTop: SPACING.sm,
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.text,
  },
});