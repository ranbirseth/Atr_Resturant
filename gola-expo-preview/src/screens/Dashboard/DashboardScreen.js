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

import {getBills} from '../../api/billService';
import {getLowStockAlerts, getOrders} from '../../api/dashboardService';
import {getIngredients, getMovements} from '../../api/inventoryService';
import {
  buildTodayTrend,
  computeTodayPopularItems,
  computeTodayPosRevenue,
  computeTodayStats,
  formatCurrency,
  formatNumber,
  istDayBounds,
  istDateKey,
} from '../../utils/dashboardMetrics';
import {calculateConsumptionCost} from '../../utils/inventoryAnalyticsUtils';
import StatCard from '../../components/dashboard/StatCard';
import PosBillsToday from '../../components/dashboard/PosBillsToday';
import StaffCart from '../../components/dashboard/StaffCart';
import OrdersTrend from '../../components/dashboard/OrdersTrend';
import PopularItems from '../../components/dashboard/PopularItems';
import LowStockAlerts from '../../components/dashboard/LowStockAlerts';
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
  const [posBills, setPosBills] = useState([]);
  const [inventoryUsageCost, setInventoryUsageCost] = useState({
    totalCost: 0,
    consumptionMovements: 0,
    unpricedMovements: 0,
  });
  const [inventoryCostError, setInventoryCostError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [viewedAt, setViewedAt] = useState(null);
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
    let succeeded = false;
    try {
      const now = new Date();
      const {start, end} = istDayBounds(now);
      const billsFrom = istDateKey(new Date(start.getTime() - 29 * 24 * 60 * 60 * 1000));
      const [ordersData, alertsData, posBillsData, inventoryCostResult] = await Promise.all([
        getOrders(),
        getLowStockAlerts().catch(function () {
          return [];
        }),
        getBills({
          from: billsFrom,
          to: istDateKey(now),
        }),
        Promise.all([
          getMovements({
            type: 'CONSUMPTION',
            from: start.toISOString(),
            to: new Date(end.getTime() - 1).toISOString(),
            limit: 500,
          }),
          getIngredients(),
        ])
          .then(function ([movements, ingredients]) {
            return {
              cost: calculateConsumptionCost(
                movements,
                ingredients,
                start.getTime(),
                end.getTime() - 1,
              ),
              movementLimitReached: movements.length >= 500,
            };
          })
          .catch(function (inventoryError) {
            return {
              error: inventoryError || new Error('Unable to load inventory usage.'),
            };
          }),
      ]);
      setOrders(ordersData);
      setAlerts(alertsData);
      setPosBills(posBillsData);
      if (inventoryCostResult.error) {
        setInventoryCostError(
          (inventoryCostResult.error && inventoryCostResult.error.message) ||
            'Unable to load inventory usage.',
        );
      } else {
        setInventoryUsageCost(inventoryCostResult.cost);
        setInventoryCostError(
          inventoryCostResult.movementLimitReached
            ? 'Estimate · latest 500 movements only'
            : null,
        );
      }
      setViewedAt(now);
      succeeded = true;
    } catch (e) {
      setError((e && e.message) || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    return succeeded;
  }, []);

  // Fetch when the screen gains focus (covers first open and return visits).
  useFocusEffect(
    useCallback(() => {
      load(false);
      // No cleanup needed; do not return the promise.
    }, [load]),
  );

  const onRefresh = useCallback(() => load(true), [load]);

  const hasData = Array.isArray(orders);
  const safeOrders = useMemo(
    () => (Array.isArray(orders) ? orders : []),
    [orders],
  );

  const stats = useMemo(
    () => computeTodayStats(safeOrders, viewedAt),
    [safeOrders, viewedAt],
  );
  const trend = useMemo(
    () => buildTodayTrend(safeOrders, viewedAt, posBills),
    [safeOrders, posBills, viewedAt],
  );
  const posRevenue = useMemo(
    () => computeTodayPosRevenue(posBills, viewedAt),
    [posBills, viewedAt],
  );
  const popularItems = useMemo(
    () => computeTodayPopularItems(safeOrders, viewedAt, 5),
    [safeOrders, viewedAt],
  );

  const isTwoColumn = width >= TWO_COLUMN_MIN_WIDTH;
  const contentWidth = Math.max(0, width - H_PADDING * 2);
  const cardWidth = isTwoColumn
    ? Math.floor((contentWidth - CARD_GAP) / 2)
    : contentWidth;

  const statCards = [
    {
      key: 'revenue',
      label: "Today's Revenue",
      value: formatCurrency(stats.totalRevenue + posRevenue),
      accent: COLORS.revenue,
      hint: 'IST today · orders + customer bill totals + settled staff payments',
    },
    {
      key: 'orders',
      label: "Today's Orders",
      value: formatNumber(stats.totalOrders),
      accent: COLORS.orders,
      hint: 'All orders placed in IST today',
    },
    {
      key: 'pending',
      label: 'Pending Orders',
      value: formatNumber(stats.pendingOrders),
      accent: COLORS.pending,
      hint: 'PLACED + PENDING (IST today)',
    },
    {
      key: 'completed',
      label: 'Completed Orders',
      value: formatNumber(stats.completedOrders),
      accent: COLORS.completed,
      hint: 'COMPLETED (IST today)',
    },
    {
      key: 'inventory-cost',
      label: "Today's Inventory Cost",
      value: inventoryCostError ? '—' : formatCurrency(inventoryUsageCost.totalCost),
      accent: COLORS.accent,
      hint: inventoryCostError
        ? inventoryCostError
        : inventoryUsageCost.consumptionMovements === 0
          ? 'No consumption logged today'
          : inventoryUsageCost.totalCost === 0 ||
              inventoryUsageCost.unpricedMovements > 0
            ? 'Set ingredient purchase prices to see accurate cost.'
            : 'Estimate · logged usage × unit cost',
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
        Today&apos;s IST snapshot from orders, POS bills, and inventory activity
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
            {[0, 1, 2, 3, 4].map(function (i) {
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

          <View style={styles.spacer} />

          <PosBillsToday bills={posBills} now={viewedAt} />

          <View style={styles.spacer} />

          <StaffCart
            onCheckoutComplete={onRefresh}
            refreshKey={viewedAt ? viewedAt.getTime() : null}
          />

          <View style={styles.spacer} />

          <OrdersTrend data={trend} />

          <View style={styles.spacer} />

          <PopularItems items={popularItems} />

          <View style={styles.spacer} />

          <LowStockAlerts alerts={alerts} />

          {hasData && safeOrders.length === 0 ? (
            <Text style={styles.emptyNote}>
              No orders today yet. Pull down to refresh once orders come in.
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
