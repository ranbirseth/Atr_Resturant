import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import StateView from '../../components/menu/StateView';
import MovementModal from './MovementModal';
import HistoryModal from './HistoryModal';
import { getStock, recordMovement, setPurchaseStatus } from '../../api/inventoryService';
import {
  STOCK_FILTERS,
  filterStockList,
  formatQty,
  getErrorMessage,
  purchaseStatusLabel,
} from '../../utils/inventoryUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

const MOVEMENT_LABELS = {
  CONSUMPTION: 'Consume',
  RESTOCK: 'Restock',
  ADJUSTMENT: 'Adjust',
};

export default function StockScreen() {
  const { width } = useWindowDimensions();
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState(null);
  const [movementModal, setMovementModal] = useState(null); // { mode, item }
  const [historyItem, setHistoryItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async function load(isRefresh) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getStock({});
      setRows(data);
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load stock'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(
      function () {
        load(hasLoadedRef.current);
        hasLoadedRef.current = true;
      },
      [load],
    ),
  );

  const filtered = useMemo(
    function () {
      return filterStockList(rows, { filter, query });
    },
    [rows, filter, query],
  );

  const columns = width >= 1050 ? 3 : width >= 720 ? 2 : 1;

  function openMovement(mode, item) {
    setServerError(null);
    setMovementModal({ mode, item });
  }

  function closeMovement() {
    setMovementModal(null);
    setServerError(null);
  }

  async function handleMovement(payload) {
    setSaving(true);
    setServerError(null);
    try {
      await recordMovement(payload);
      closeMovement();
      load(true);
    } catch (movementError) {
      setServerError(getErrorMessage(movementError, 'Failed to record movement'));
    } finally {
      setSaving(false);
    }
  }

  async function runPurchaseStatus(item, status, message) {
    setActionError(null);
    try {
      await setPurchaseStatus(item._id, status);
      message && setActionError(message);
      load(true);
    } catch (purchaseError) {
      setActionError(getErrorMessage(purchaseError, 'Failed to update purchase state'));
    }
  }

  function confirmNeedToBuy(item) {
    Alert.alert('Mark "Need to Buy"', `Mark "${item.name}" as needing a purchase?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark', onPress: () => runPurchaseStatus(item, 'NEEDED') },
    ]);
  }

  function renderCard({ item }) {
    const badges = [];
    if (item.outOfStock) badges.push({ label: 'Out of Stock', style: 'danger' });
    else if (item.lowStock) badges.push({ label: 'Low Stock', style: 'pending' });
    else badges.push({ label: 'Available', style: 'good' });

    if (item.needToBuy) {
      badges.push({ label: 'Need to Buy', style: 'pending' });
    }

    const purchase = item.purchaseStatus && item.purchaseStatus !== 'NONE' ? item.purchaseStatus : null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.unitPill}>{item.unit}</Text>
        </View>

        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>In stock</Text>
          <Text style={styles.qtyValue}>{formatQty(item.currentQty, item.unit)}</Text>
        </View>

        {item.usagePercent !== null && item.usagePercent !== undefined ? (
          <View style={styles.usageBlock}>
            <View style={styles.usageLabels}>
              <Text style={styles.usageLabel}>Current cycle usage</Text>
              <Text style={styles.usageValue}>{item.usagePercent}%</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, item.usagePercent))}%` }]} />
            </View>
          </View>
        ) : (
          <Text style={styles.noCycle}>No usage cycle yet — record a restock to start one.</Text>
        )}

        {item.suggestedQty > 0 ? (
          <Text style={styles.suggested}>Suggested buy: {formatQty(item.suggestedQty, item.unit)}</Text>
        ) : null}

        <View style={styles.badgeRow}>
          {badges.map(function (badge) {
            return (
              <View key={badge.label} style={[styles.badge, styles[badge.style]]}>
                <Text style={[styles.badgeText, styles[`${badge.style}Text`]]}>{badge.label}</Text>
              </View>
            );
          })}
        </View>

        {purchase ? (
          <Text style={styles.purchase}>Purchase: {purchaseStatusLabel(purchase)}</Text>
        ) : null}

        <View style={styles.actions}>
          {['CONSUMPTION', 'RESTOCK', 'ADJUSTMENT'].map(function (mode) {
            return (
              <Pressable
                key={mode}
                style={styles.actionBtn}
                onPress={() => openMovement(mode, item)}>
                <Text style={styles.actionText}>{MOVEMENT_LABELS[mode]}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.purchaseRow}>
          {item.purchaseStatus === 'NEEDED' ? (
            <Pressable style={styles.purchaseBtn} onPress={() => runPurchaseStatus(item, 'ORDERED')}>
              <Text style={styles.purchaseBtnText}>Mark Ordered</Text>
            </Pressable>
          ) : null}
          {item.purchaseStatus === 'ORDERED' ? (
            <Pressable style={styles.purchaseBtn} onPress={() => openMovement('RESTOCK', item)}>
              <Text style={styles.purchaseBtnText}>Complete (Restock)</Text>
            </Pressable>
          ) : null}
          {item.purchaseStatus === 'NONE' ? (
            <Pressable style={styles.purchaseBtn} onPress={() => confirmNeedToBuy(item)}>
              <Text style={styles.purchaseBtnText}>Need to Buy</Text>
            </Pressable>
          ) : null}
          {item.outOfStock ? (
            <Pressable style={styles.purchaseBtn} onPress={() => confirmNeedToBuy(item)}>
              <Text style={styles.purchaseBtnText}>Used up</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.purchaseBtn, styles.historyBtn]} onPress={() => setHistoryItem(item)}>
            <Text style={styles.purchaseBtnText}>History</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loading) {
    return <StateView mode="loading" message="Loading stock…" />;
  }
  if (error) {
    return <StateView mode="error" message={error} onRetry={() => load(false)} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        key={columns}
        data={filtered}
        keyExtractor={(item) => String(item._id)}
        numColumns={columns}
        renderItem={renderCard}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        ListHeaderComponent={
          <View>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search stock…"
              placeholderTextColor={COLORS.muted}
            />
            <View style={styles.chipRow}>
              {STOCK_FILTERS.map(function (entry) {
                const active = filter === entry.key;
                return (
                  <Pressable
                    key={entry.key}
                    onPress={() => setFilter(entry.key)}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{entry.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
          </View>
        }
        ListEmptyComponent={<StateView mode="empty" message="No stock entries match your filters." />}
      />

      {movementModal ? (
        <MovementModal
          item={movementModal.item}
          mode={movementModal.mode}
          saving={saving}
          serverError={serverError}
          onClose={closeMovement}
          onSubmit={handleMovement}
        />
      ) : null}

      {historyItem ? <HistoryModal item={historyItem} onClose={() => setHistoryItem(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  columns: { gap: SPACING.lg },
  search: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.muted },
  chipTextActive: { color: '#ffffff' },
  actionError: { color: COLORS.danger, fontWeight: '600', marginBottom: SPACING.sm },
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACING.sm },
  itemName: { flex: 1, fontSize: 16, fontWeight: '800', color: COLORS.text },
  unitPill: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    backgroundColor: COLORS.barTrack,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  qtyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: SPACING.md },
  qtyLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase' },
  qtyValue: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  usageBlock: { marginTop: SPACING.md },
  usageLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
  usageLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  usageValue: { fontSize: 12, fontWeight: '800', color: COLORS.text },
  barTrack: { height: 8, borderRadius: RADIUS.sm, backgroundColor: COLORS.barTrack, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: RADIUS.sm, backgroundColor: COLORS.accent },
  noCycle: { marginTop: SPACING.md, fontSize: 12, color: COLORS.muted },
  suggested: { marginTop: SPACING.sm, fontSize: 12, fontWeight: '700', color: COLORS.pending },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  badge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  good: { backgroundColor: '#e7f6ec' },
  goodText: { color: COLORS.revenue },
  pending: { backgroundColor: '#fdf3e3' },
  pendingText: { color: COLORS.pending },
  danger: { backgroundColor: COLORS.dangerBg },
  dangerText: { color: COLORS.danger },
  purchase: { marginTop: SPACING.sm, fontSize: 12, fontWeight: '700', color: COLORS.orders },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  actionBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  purchaseRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  purchaseBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  historyBtn: { backgroundColor: COLORS.orders },
  purchaseBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
});