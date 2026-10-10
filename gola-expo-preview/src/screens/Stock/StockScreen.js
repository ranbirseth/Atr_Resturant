import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import StateView from '../../components/menu/StateView';
import MovementModal from './MovementModal';
import { getStock, recordMovement } from '../../api/inventoryService';
import { computeConsumedQuantity, formatPercent, formatQty, getErrorMessage } from '../../utils/inventoryUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

// Current Stock section: simple cards with Consume and Restock only. The
// balance shown always comes from the backend after each successful movement.
export default function StockScreen() {
  const { width } = useWindowDimensions();
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [movementModal, setMovementModal] = useState(null); // { mode, item }
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

  function renderCard({ item }) {
    const consumed = computeConsumedQuantity(item.baselineQty, item.currentQty);
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.unitPill}>{item.unit}</Text>
        </View>

        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>Available</Text>
          <Text style={styles.qtyValue}>{formatQty(item.currentQty, item.unit)}</Text>
        </View>

        <Text style={styles.used}>
          {consumed === null
            ? 'Used this batch: —'
            : `Used this batch: ${formatQty(consumed, item.unit)}`}
        </Text>

        {item.usageAlert === true ? (
          <View style={styles.alertRow}>
            <Text style={styles.alertText}>
              {formatPercent(item.usagePercent)} of this batch used — restock soon
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable style={[styles.actionBtn, styles.consumeBtn]} onPress={() => openMovement('CONSUMPTION', item)}>
            <Text style={styles.consumeText}>Consume</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.restockBtn]} onPress={() => openMovement('RESTOCK', item)}>
            <Text style={styles.restockText}>Restock</Text>
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
        data={Array.isArray(rows) ? rows : []}
        keyExtractor={(item) => String(item._id)}
        numColumns={columns}
        renderItem={renderCard}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        ListEmptyComponent={<StateView mode="empty" message="No stock yet. Add inventory first." />}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  columns: { gap: SPACING.lg },
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
  qtyValue: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  used: { marginTop: SPACING.sm, fontSize: 13, color: COLORS.muted },
  alertRow: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBg,
    alignSelf: 'flex-start',
  },
  alertText: { fontSize: 12, fontWeight: '700', color: COLORS.danger },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg },
  actionBtn: { flex: 1, paddingVertical: SPACING.md + 2, borderRadius: RADIUS.md, alignItems: 'center' },
  consumeBtn: { backgroundColor: COLORS.dangerBg, borderWidth: 1, borderColor: COLORS.dangerBg },
  consumeText: { color: COLORS.danger, fontWeight: '800', fontSize: 15 },
  restockBtn: { backgroundColor: COLORS.accent },
  restockText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
});