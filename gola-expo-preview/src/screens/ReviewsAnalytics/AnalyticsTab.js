import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import StateView from '../../components/menu/StateView';
import StatCard from '../../components/dashboard/StatCard';
import { getOrders } from '../../api/dashboardService';
import { getFeedbacks } from '../../api/reviewsService';
import {
  RANGE_OPTIONS,
  computeAnalytics,
  computeRatingStats,
  formatCurrency,
  formatNumber,
  formatRating,
} from '../../utils/analyticsUtils';
import { getErrorMessage } from '../../utils/menuUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

const H_PADDING = SPACING.lg;
const CARD_GAP = SPACING.md;
const TWO_COLUMN_MIN_WIDTH = 600;

// Analytics tab: real numbers from GET /api/orders (revenue/AOV/daily sales,
// cancelled orders excluded) and GET /api/feedback (customer rating).
export default function AnalyticsTab() {
  const { width } = useWindowDimensions();
  const [orders, setOrders] = useState(null);
  const [feedbacks, setFeedbacks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('7d');

  const load = useCallback(async function load(isRefresh) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const results = await Promise.all([
        getOrders(),
        // A failed feedback call must not break revenue analytics.
        getFeedbacks().catch(function () {
          return null;
        }),
      ]);
      setOrders(results[0]);
      setFeedbacks(results[1]);
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load analytics'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(
      function () {
        load(false);
      },
      [load],
    ),
  );

  const onRefresh = useCallback(
    function () {
      load(true);
    },
    [load],
  );

  const onRetry = useCallback(
    function () {
      load(false);
    },
    [load],
  );

  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);
  const safeFeedbacks = useMemo(
    () => (Array.isArray(feedbacks) ? feedbacks : []),
    [feedbacks],
  );

  const analytics = useMemo(
    function () {
      return computeAnalytics(safeOrders, range, new Date());
    },
    [safeOrders, range],
  );
  const rating = useMemo(
    function () {
      return computeRatingStats(safeFeedbacks);
    },
    [safeFeedbacks],
  );

  const hasOrders = Array.isArray(orders);
  const initialLoading = loading && !hasOrders;
  const showFullError = !!error && !hasOrders;

  const isTwoColumn = width >= TWO_COLUMN_MIN_WIDTH;
  const contentWidth = Math.max(0, width - H_PADDING * 2);
  const cardWidth = isTwoColumn
    ? Math.floor((contentWidth - CARD_GAP) / 2)
    : contentWidth;

  const maxDailyRevenue = analytics.dailySales.reduce(function (max, day) {
    return Math.max(max, day.revenue);
  }, 0);

  const rangeLabel = (RANGE_OPTIONS.find(function (option) {
    return option.key === range;
  }) || {}).label;

  const statCards = [
    {
      key: 'revenue',
      label: 'Total Revenue',
      value: formatCurrency(analytics.totalRevenue),
      accent: COLORS.revenue,
      hint: 'Net sales after discounts; excludes cancelled',
    },
    {
      key: 'aov',
      label: 'Avg Order Value',
      value: formatCurrency(analytics.avgOrderValue),
      accent: COLORS.orders,
      hint: formatNumber(analytics.orderCount) + ' eligible orders',
    },
    {
      key: 'orders',
      label: 'Total Orders',
      value: formatNumber(analytics.orderCount),
      accent: COLORS.pending,
      hint: 'Excludes cancelled orders',
    },
    {
      key: 'rating',
      label: 'Customer Rating',
      value: formatRating(rating.average, rating.count),
      accent: COLORS.completed,
      hint: rating.count > 0 ? formatNumber(rating.count) + ' ratings' : 'No ratings yet',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.rangeBar}>
        {RANGE_OPTIONS.map(function (option) {
          const active = range === option.key;
          return (
            <Pressable
              key={option.key}
              style={[styles.rangeChip, active && styles.rangeChipActive]}
              onPress={() => setRange(option.key)}>
              <Text style={[styles.rangeText, active && styles.rangeTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {initialLoading ? (
        <StateView mode="loading" message="Loading analytics…" />
      ) : showFullError ? (
        <StateView mode="error" message={error} onRetry={onRetry} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText} numberOfLines={2}>
                Couldn&apos;t refresh: {error}
              </Text>
              <Pressable style={styles.errorBannerButton} onPress={onRefresh}>
                <Text style={styles.errorBannerButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.statsGrid}>
            {statCards.map(function (card) {
              return (
                <StatCard
                  key={card.key}
                  style={{ width: cardWidth }}
                  label={card.label}
                  value={card.value}
                  accent={card.accent}
                  hint={card.hint}
                />
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daily Sales</Text>
            <Text style={styles.cardSubtitle}>
              {rangeLabel} · eligible (non-cancelled) orders
            </Text>

            {maxDailyRevenue === 0 ? (
              <Text style={styles.empty}>No sales in this range.</Text>
            ) : (
              analytics.dailySales.map(function (day) {
                const ratio = maxDailyRevenue > 0 ? day.revenue / maxDailyRevenue : 0;
                return (
                  <View key={day.key} style={styles.dayRow}>
                    <Text style={styles.dayLabel} numberOfLines={1}>
                      {day.label}
                    </Text>
                    <View style={styles.dayTrack}>
                      <View style={[styles.dayBar, { width: ratio * 100 + '%' }]} />
                    </View>
                    <Text style={styles.dayValue} numberOfLines={1}>
                      {formatCurrency(day.revenue)}
                    </Text>
                    <Text style={styles.dayOrders}>{day.orders}</Text>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sales Breakdown</Text>
            <Text style={styles.cardSubtitle}>How Total Revenue is calculated</Text>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Gross sales (before discounts)</Text>
              <Text style={styles.breakdownValue}>{formatCurrency(analytics.grossSales)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Less: discounts</Text>
              <Text style={styles.breakdownValue}>{'\u2212' + formatCurrency(analytics.totalDiscount)}</Text>
            </View>
            <View style={[styles.breakdownRow, styles.breakdownTotal]}>
              <Text style={styles.breakdownTotalLabel}>Net revenue (Total Revenue)</Text>
              <Text style={styles.breakdownTotalValue}>{formatCurrency(analytics.totalRevenue)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Cancelled orders excluded</Text>
              <Text style={styles.breakdownValue}>{formatNumber(analytics.cancelledCount)}</Text>
            </View>
          </View>

          <View style={styles.gapCard}>
            <Text style={styles.gapTitle}>Inventory: Purchases vs Sales</Text>
            <Text style={styles.gapText}>
              Not available. The backend has no inventory, stock, or market-purchase
              records, so daily purchases cannot be compared with sales.
            </Text>
            <Text style={styles.gapText}>
              This comparison also requires purchase fields (date, item, quantity, unit
              cost). None exist today, so nothing is fabricated here.
            </Text>
            <Text style={styles.gapNote}>
              Note: revenue minus purchase spending is not profit — unsold inventory and
              other costs are not captured.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  rangeBar: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rangeChip: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rangeChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  rangeText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.muted,
  },
  rangeTextActive: {
    color: '#ffffff',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: H_PADDING,
    paddingBottom: SPACING.xl * 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerBg,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.danger,
  },
  errorBannerButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.sm,
  },
  errorBannerButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardSubtitle: {
    marginTop: 2,
    marginBottom: SPACING.md,
    fontSize: 12,
    color: COLORS.muted,
  },
  empty: {
    marginTop: SPACING.sm,
    fontSize: 13,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  dayLabel: {
    width: 64,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  dayTrack: {
    flex: 1,
    height: 10,
    backgroundColor: COLORS.barTrack,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  dayBar: {
    height: '100%',
    backgroundColor: COLORS.bar,
    borderRadius: RADIUS.sm,
  },
  dayValue: {
    width: 76,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  dayOrders: {
    width: 28,
    textAlign: 'right',
    fontSize: 12,
    color: COLORS.muted,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  breakdownLabel: {
    fontSize: 13,
    color: COLORS.muted,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  breakdownTotal: {
    borderBottomWidth: 0,
  },
  breakdownTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  breakdownTotalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.revenue,
  },
  gapCard: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.pending,
    padding: SPACING.lg,
  },
  gapTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  gapText: {
    marginTop: SPACING.sm,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.muted,
  },
  gapNote: {
    marginTop: SPACING.md,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.pending,
  },
});
