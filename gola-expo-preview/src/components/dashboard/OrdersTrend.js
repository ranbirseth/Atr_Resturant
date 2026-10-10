import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {COLORS, RADIUS, SPACING} from '../../theme';

const MAX_BAR_HEIGHT = 120;

// Native View bars: no chart library, Expo Go safe.
export default function OrdersTrend({data}) {
  const safe = Array.isArray(data) ? data : [];
  const maxCount = safe.reduce(function (max, day) {
    return Math.max(max, Number(day && day.count) || 0);
  }, 0);
  const total = safe.reduce(function (sum, day) {
    return sum + (Number(day && day.count) || 0);
  }, 0);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Orders Trend</Text>
      <Text style={styles.subtitle}>Daily order count for the last 7 days</Text>

      {safe.length === 0 ? (
        <Text style={styles.empty}>No order data available.</Text>
      ) : (
        <>
          {total === 0 ? (
            <Text style={styles.empty}>No orders in the last 7 days.</Text>
          ) : null}
          <View style={styles.chart}>
            {safe.map(function (day) {
              const count = Number(day && day.count) || 0;
              const ratio = maxCount > 0 ? count / maxCount : 0;
              const height = Math.max(0, ratio * MAX_BAR_HEIGHT);
              return (
                <View key={day.key} style={styles.column}>
                  <Text style={styles.count}>{count}</Text>
                  <View style={styles.track}>
                    <View style={[styles.bar, {height: height}]} />
                  </View>
                  <Text style={styles.dayLabel}>{day.label}</Text>
                  <Text style={styles.dateLabel}>{day.dayOfMonth}</Text>
                </View>
              );
            })}
          </View>
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
    justifyContent: 'space-between',
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  track: {
    height: MAX_BAR_HEIGHT,
    width: '58%',
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
  dayLabel: {
    marginTop: SPACING.sm,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  dateLabel: {
    fontSize: 11,
    color: COLORS.muted,
  },
});
