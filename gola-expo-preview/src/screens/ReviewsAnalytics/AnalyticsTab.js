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
import { getBills } from '../../api/billService';
import { getFeedbacks } from '../../api/reviewsService';
import { getIngredients, getMovements } from '../../api/inventoryService';
import {
  computeRatingStats,
  formatCurrency,
  formatNumber,
  formatRating,
} from '../../utils/analyticsUtils';
import {
  BILL_RANGE_OPTIONS,
  rangeStartMs,
  rangeEndMs,
  computeBillAnalytics,
} from '../../utils/billAnalyticsUtils';
import {
  summarizeMovements,
  itemsAddedInRange,
  buildItemActivity,
  buildUsageRanking,
} from '../../utils/inventoryAnalyticsUtils';
import { getErrorMessage } from '../../utils/menuUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

const H_PADDING = SPACING.lg;
const CARD_GAP = SPACING.md;
const TWO_COLUMN_MIN_WIDTH = 600;
const MOVEMENTS_LIMIT = 500;

// Quantities are shown per item (in the item's own unit), so truncation to two
// decimals is unit-safe; totals never mix units on screen.
function quantityText(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '\u2014';
  }
  return String(Number(Number(value).toFixed(2)));
}

// Analytics tab (Phase 3): real numbers from GET /api/billing/bills (bill-based
// sales, the financial source of truth), GET /api/inventory/stock/movements +
// GET /api/inventory/ingredients (stock activity) and GET /api/feedback
// (customer rating). All bucketing is done in IST calendar days.
export default function AnalyticsTab() {
  const { width } = useWindowDimensions();
  const [bills, setBills] = useState(null);
  const [feedbacks, setFeedbacks] = useState(null);
  const [movements, setMovements] = useState(null);
  const [ingredients, setIngredients] = useState(null);
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
      // Movements are fetched once for the widest (30-day) IST window; the pure
      // helpers re-filter by the selected range, so a filter change never shows
      // stale numbers or triggers a refetch.
      const now = new Date();
      const from = new Date(rangeStartMs('30d', now));
      const to = new Date(rangeEndMs('30d', now));
      const results = await Promise.all([
        getBills(),
        // A failed feedback/movement/ingredient call must not break the rest.
        getFeedbacks().catch(function () {
          return null;
        }),
        getMovements({ from: from.toISOString(), to: to.toISOString(), limit: MOVEMENTS_LIMIT }).catch(function () {
          return null;
        }),
        getIngredients().catch(function () {
          return null;
        }),
      ]);
      setBills(results[0]);
      setFeedbacks(results[1]);
      setMovements(results[2]);
      setIngredients(results[3]);
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

  const safeBills = useMemo(() => (Array.isArray(bills) ? bills : []), [bills]);
  const safeFeedbacks = useMemo(
    () => (Array.isArray(feedbacks) ? feedbacks : []),
    [feedbacks],
  );
  const safeMovements = useMemo(
    () => (Array.isArray(movements) ? movements : []),
    [movements],
  );
  const safeIngredients = useMemo(
    () => (Array.isArray(ingredients) ? ingredients : []),
    [ingredients],
  );

  const analytics = useMemo(
    function () {
      return computeBillAnalytics(safeBills, range, new Date());
    },
    [safeBills, range],
  );
  const rating = useMemo(
    function () {
      return computeRatingStats(safeFeedbacks);
    },
    [safeFeedbacks],
  );

  const inventory = useMemo(
    function () {
      const now = new Date();
      const from = rangeStartMs(range, now);
      const to = rangeEndMs(range, now);
      return {
        summary: summarizeMovements(safeMovements, from, to),
        itemsAdded: itemsAddedInRange(safeIngredients, from, to),
        itemActivity: buildItemActivity(safeMovements, safeIngredients, from, to),
        usage: buildUsageRanking(safeMovements, safeIngredients, from, to),
        capped: safeMovements.length >= MOVEMENTS_LIMIT,
      };
    },
    [safeMovements, safeIngredients, range],
  );

  const hasBills = Array.isArray(bills);
  const initialLoading = loading && !hasBills;
  const showFullError = !!error && !hasBills;

  const isTwoColumn = width >= TWO_COLUMN_MIN_WIDTH;
  const contentWidth = Math.max(0, width - H_PADDING * 2);
  const cardWidth = isTwoColumn
    ? Math.floor((contentWidth - CARD_GAP) / 2)
    : contentWidth;

  const maxDailyRevenue = analytics.dailySales.reduce(function (max, day) {
    return Math.max(max, day.revenue);
  }, 0);

  const rangeLabel = (BILL_RANGE_OPTIONS.find(function (option) {
    return option.key === range;
  }) || {}).label;

  const statCards = [
    {
      key: 'revenue',
      label: 'Total Revenue',
      value: formatCurrency(analytics.totalRevenue),
      accent: COLORS.revenue,
      hint: 'Recognized bills (OPEN + SETTLED); voided excluded',
    },
    {
      key: 'bills',
      label: 'Generated Bills',
      value: formatNumber(analytics.recognizedBills),
      accent: COLORS.orders,
      hint: formatNumber(analytics.totalBills) + ' bills in range',
    },
    {
      key: 'aov',
      label: 'Avg Order Value',
      value: formatCurrency(analytics.avgOrderValue),
      accent: COLORS.pending,
      hint: formatNumber(analytics.recognizedBills) + ' recognized bills (AOV denominator)',
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
        {BILL_RANGE_OPTIONS.map(function (option) {
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
              {rangeLabel} · recognized OPEN + SETTLED bills · IST days
            </Text>

            {maxDailyRevenue === 0 ? (
              <Text style={styles.empty}>No recognized sales in this range.</Text>
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
            <Text style={styles.cardTitle}>Bill Breakdown</Text>
            <Text style={styles.cardSubtitle}>
              Financial source of truth: bill records · {rangeLabel}
            </Text>

            <Text style={styles.groupTitle}>By customer type</Text>
            {analytics.byAudience.map(function (entry) {
              return (
                <View key={entry.audience} style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Text style={styles.breakdownLabel}>{entry.audience}</Text>
                    <Text style={styles.breakdownSub}>
                      {formatNumber(entry.recognized)} recognized
                      {entry.voided > 0 ? ' · ' + formatNumber(entry.voided) + ' voided' : ''}
                    </Text>
                  </View>
                  <Text style={styles.breakdownValue}>{formatCurrency(entry.revenue)}</Text>
                </View>
              );
            })}

            <Text style={styles.groupTitle}>Bill source</Text>
            {analytics.byOrigin.map(function (entry) {
              return (
                <View key={entry.origin} style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Text style={styles.breakdownLabel}>{entry.origin}</Text>
                    <Text style={styles.breakdownSub}>
                      {formatNumber(entry.recognized)} recognized
                      {entry.voided > 0 ? ' · ' + formatNumber(entry.voided) + ' voided' : ''}
                    </Text>
                  </View>
                  <Text style={styles.breakdownValue}>{formatCurrency(entry.revenue)}</Text>
                </View>
              );
            })}

            <Text style={styles.groupTitle}>Payments &amp; voids</Text>
            <View style={styles.breakdownRow}>
              <View style={styles.breakdownLeft}>
                <Text style={styles.breakdownLabel}>Amount collected</Text>
                <Text style={styles.breakdownSub}>Payments recorded on recognized bills</Text>
              </View>
              <Text style={styles.breakdownValue}>{formatCurrency(analytics.amountPaid)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <View style={styles.breakdownLeft}>
                <Text style={styles.breakdownLabel}>Balance due</Text>
                <Text style={styles.breakdownSub}>On OPEN bills; settles when paid</Text>
              </View>
              <Text style={styles.breakdownValue}>{formatCurrency(analytics.balanceDue)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <View style={styles.breakdownLeft}>
                <Text style={styles.breakdownLabel}>Voided (excluded from revenue)</Text>
                <Text style={styles.breakdownSub}>{formatNumber(analytics.voidedBills)} bills</Text>
              </View>
              <Text style={styles.breakdownValue}>{formatCurrency(analytics.voidedTotal)}</Text>
            </View>

            <Text style={styles.ruleNote}>
              Bills use the audience/origin they were generated with; bills recorded before that
              tracking existed are counted as SESSION / CUSTOMER. AOV divides recognized bill
              revenue by recognized bill count, never by a raw order count.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Inventory Activity</Text>
            <Text style={styles.cardSubtitle}>
              {rangeLabel} · stock movement ledger (COMMITTED only, RESERVED excluded)
              {inventory.capped ? ' · capped at the most recent ' + MOVEMENTS_LIMIT : ''}
            </Text>

            {movements === null || ingredients === null ? (
              <Text style={styles.empty}>
                Inventory data is unavailable right now. Pull to refresh to retry.
              </Text>
            ) : (
              <View>
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Text style={styles.breakdownLabel}>Restocks</Text>
                    <Text style={styles.breakdownSub}>
                      {formatNumber(inventory.summary.restockEvents)} event
                      {inventory.summary.restockEvents === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {quantityText(inventory.summary.restockedQty)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Text style={styles.breakdownLabel}>Consumption</Text>
                    <Text style={styles.breakdownSub}>
                      {formatNumber(inventory.summary.consumptionEvents)} movement
                      {inventory.summary.consumptionEvents === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {quantityText(inventory.summary.consumedQty)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Text style={styles.breakdownLabel}>Opening</Text>
                    <Text style={styles.breakdownSub}>
                      {formatNumber(inventory.summary.openingEvents)} event
                      {inventory.summary.openingEvents === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {quantityText(inventory.summary.openingQty)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Text style={styles.breakdownLabel}>Adjustments</Text>
                    <Text style={styles.breakdownSub}>
                      {formatNumber(inventory.summary.adjustmentEvents)} event
                      {inventory.summary.adjustmentEvents === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {quantityText(inventory.summary.adjustmentQty)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Text style={styles.breakdownLabel}>Total movements</Text>
                    <Text style={styles.breakdownSub}>COMMITTED movements in range</Text>
                  </View>
                  <Text style={styles.breakdownValue}>
                    {formatNumber(inventory.summary.movementCount)}
                  </Text>
                </View>

                <Text style={styles.groupTitle}>Restocked &amp; consumed by item (period)</Text>
                {inventory.itemActivity.length === 0 ? (
                  <Text style={styles.empty}>No committed stock movements in this range.</Text>
                ) : (
                  inventory.itemActivity.map(function (row) {
                    return (
                      <View key={row.ingredientId} style={styles.suggestRow}>
                        <View style={styles.suggestLeft}>
                          <Text style={styles.suggestName}>{row.name}</Text>
                          <Text style={styles.suggestSub}>
                            stock {quantityText(row.currentQty)} {row.unit}
                          </Text>
                        </View>
                        <View style={styles.suggestFlow}>
                          <Text style={styles.suggestAmount}>R {quantityText(row.restockedQty)}</Text>
                          <Text style={styles.suggestAmount}>C {quantityText(row.consumedQty)}</Text>
                          <Text style={styles.suggestAmount}>A {quantityText(row.adjustmentQty)}</Text>
                        </View>
                      </View>
                    );
                  })
                )}

                <Text style={styles.groupTitle}>Items added this period</Text>
                {inventory.itemsAdded.length === 0 ? (
                  <Text style={styles.empty}>No new inventory items recorded in this range.</Text>
                ) : (
                  inventory.itemsAdded.map(function (item) {
                    return (
                      <View key={item._id || item.name} style={styles.suggestRow}>
                        <View style={styles.suggestLeft}>
                          <Text style={styles.suggestName}>{item.name}</Text>
                          <Text style={styles.suggestSub}>{item.unit}</Text>
                        </View>
                        <Text style={styles.suggestFlow}>
                          {quantityText(item.currentQty)} {item.unit}
                        </Text>
                      </View>
                    );
                  })
                )}

                <Text style={styles.ruleNote}>
                  Quantities are shown per item in the item&apos;s own unit and are never summed
                  across different units. RESERVED (uncommitted) movements never count. Current
                  stock is separate from period movement totals - it is not treated as consumption.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Purchase Suggestions</Text>
            <Text style={styles.cardSubtitle}>
              Ranked by completed consumption in the period · {rangeLabel}
            </Text>

            {movements === null ? (
              <Text style={styles.empty}>
                Movement data is unavailable right now. Pull to refresh to retry.
              </Text>
            ) : inventory.usage.length === 0 ? (
              <Text style={styles.empty}>
                No completed consumption in this range, so there are no usage-based suggestions.
              </Text>
            ) : (
              inventory.usage.map(function (row) {
                return (
                  <View key={row.ingredientId} style={styles.suggestRow}>
                    <View style={styles.suggestLeft}>
                      <Text style={styles.suggestName}>{row.name}</Text>
                      <Text style={styles.suggestSub}>
                        {quantityText(row.consumedQty)} {row.unit} consumed in{' '}
                        {formatNumber(row.consumptionEvents)} event
                        {row.consumptionEvents === 1 ? '' : 's'} · stock{' '}
                        {quantityText(row.currentQty)} {row.unit}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.suggestReorder,
                        row.reorderQty === null && styles.suggestReorderNone,
                      ]}>
                      {row.reorderQty === null ? '—' : 'Reorder ' + quantityText(row.reorderQty)}
                    </Text>
                  </View>
                );
              })
            )}

            <Text style={styles.ruleNote}>
              Items consumed this period, highest quantity first. Reorder amount = minimum stock
              level − current stock, shown only when a minimum is defined and is above current
              stock. These are usage-based suggestions, not a stockout prediction; supplier,
              price, lead time and exact order quantities are not fabricated.
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
  groupTitle: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
  breakdownLeft: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  breakdownLabel: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },
  breakdownSub: {
    marginTop: 1,
    fontSize: 12,
    color: COLORS.muted,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  ruleNote: {
    marginTop: SPACING.md,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.muted,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  suggestLeft: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  suggestName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  suggestSub: {
    marginTop: 1,
    fontSize: 12,
    color: COLORS.muted,
  },
  suggestFlow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  suggestAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  suggestReorder: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.accent,
  },
  suggestReorderNone: {
    color: COLORS.muted,
    fontWeight: '600',
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
});