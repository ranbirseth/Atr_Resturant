import React, {useCallback, useMemo, useState} from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';

import {getOrders} from '../../api/dashboardService';
import {
  buildSevenDayTrend,
  computePopularItems,
  computeStats,
  formatCurrency,
  formatNumber,
} from '../../utils/dashboardMetrics';
import StatCard from '../../components/dashboard/StatCard';
import OrdersTrend from '../../components/dashboard/OrdersTrend';
import PopularItems from '../../components/dashboard/PopularItems';
import {COLORS, RADIUS, SPACING} from '../../theme';

const H_PADDING = SPACING.lg;
const CARD_GAP = SPACING.md;
const TWO_COLUMN_MIN_WIDTH = 600;

function SkeletonBlock({height, style}) {
  return <View style={[styles.skeleton, {height: height}, style]} />;
}

export default function DashboardScreen() {
  const {width} = useWindowDimensions();
  const [orders, setOrders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async function load(isRefresh) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await getOrders();
      setOrders(data);
    } catch (e) {
      setError((e && e.message) || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch when the screen gains focus (covers first open and return visits).
  useFocusEffect(
    useCallback(() => {
      load(false);
      // No cleanup needed; do not return the promise.
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    load(true);
  }, [load]);

  const hasData = Array.isArray(orders);
  const safeOrders = useMemo(
    () => (Array.isArray(orders) ? orders : []),
    [orders],
  );

  const stats = useMemo(() => computeStats(safeOrders), [safeOrders]);
  const trend = useMemo(() => buildSevenDayTrend(safeOrders), [safeOrders]);
  const popularItems = useMemo(
    () => computePopularItems(safeOrders, 5),
    [safeOrders],
  );

  const isTwoColumn = width >= TWO_COLUMN_MIN_WIDTH;
  const contentWidth = Math.max(0, width - H_PADDING * 2);
  const cardWidth = isTwoColumn
    ? Math.floor((contentWidth - CARD_GAP) / 2)
    : contentWidth;

  const statCards = [
    {
      key: 'revenue',
      label: 'Total Revenue',
      value: formatCurrency(stats.totalRevenue),
      accent: COLORS.revenue,
      hint: 'From non-cancelled orders',
    },
    {
      key: 'orders',
      label: 'Total Orders',
      value: formatNumber(stats.totalOrders),
      accent: COLORS.orders,
      hint: 'All orders returned by the API',
    },
    {
      key: 'pending',
      label: 'Pending Orders',
      value: formatNumber(stats.pendingOrders),
      accent: COLORS.pending,
      hint: 'PLACED + PENDING',
    },
    {
      key: 'completed',
      label: 'Completed Orders',
      value: formatNumber(stats.completedOrders),
      accent: COLORS.completed,
      hint: 'COMPLETED (incl. legacy Completed)',
    },
  ];

  const initialLoading = loading && !hasData;
  const showFullError = !!error && !hasData;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }>
      <Text style={styles.pageTitle}>Dashboard Overview</Text>
      <Text style={styles.pageSubtitle}>
        Live snapshot from GET /api/orders
      </Text>

      {error && hasData ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText} numberOfLines={2}>
            Couldn&apos;t refresh: {error}
          </Text>
          <Pressable style={styles.errorBannerButton} onPress={onRefresh}>
            <Text style={styles.errorBannerButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {initialLoading ? (
        <View>
          <View style={styles.statsGrid}>
            {[0, 1, 2, 3].map(function (i) {
              return (
                <SkeletonBlock
                  key={i}
                  height={104}
                  style={{width: cardWidth, borderRadius: RADIUS.md}}
                />
              );
            })}
          </View>
          <SkeletonBlock
            height={220}
            style={[styles.skeletonSection, {borderRadius: RADIUS.md}]}
          />
          <SkeletonBlock
            height={220}
            style={[styles.skeletonSection, {borderRadius: RADIUS.md}]}
          />
        </View>
      ) : showFullError ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateTitle}>Couldn&apos;t load the dashboard</Text>
          <Text style={styles.stateMessage}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={onRefresh}
            accessibilityRole="button">
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.statsGrid}>
            {statCards.map(function (card) {
              return (
                <StatCard
                  key={card.key}
                  style={{width: cardWidth}}
                  label={card.label}
                  value={card.value}
                  accent={card.accent}
                  hint={card.hint}
                />
              );
            })}
          </View>

          <OrdersTrend data={trend} />

          <View style={styles.spacer} />

          <PopularItems items={popularItems} />

          {hasData && safeOrders.length === 0 ? (
            <Text style={styles.emptyNote}>
              No orders yet. Pull down to refresh once orders come in.
            </Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: H_PADDING,
    paddingBottom: SPACING.xl * 2,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
  },
  pageSubtitle: {
    marginTop: 2,
    marginBottom: SPACING.lg,
    fontSize: 13,
    color: COLORS.muted,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  skeletonSection: {
    marginTop: SPACING.lg,
  },
  skeleton: {
    backgroundColor: COLORS.skeleton,
  },
  spacer: {
    height: SPACING.lg,
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
  stateBox: {
    marginTop: SPACING.xl,
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  stateMessage: {
    marginTop: SPACING.sm,
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyNote: {
    marginTop: SPACING.lg,
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
  },
});
