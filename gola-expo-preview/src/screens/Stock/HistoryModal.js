import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';
import { getCycles, getMovements } from '../../api/inventoryService';
import { formatQty, getErrorMessage } from '../../utils/inventoryUtils';

const TYPE_LABELS = {
  OPENING: 'Opening',
  RESTOCK: 'Restock',
  CONSUMPTION: 'Consumption',
  ADJUSTMENT: 'Adjustment',
};

function typeColor(type) {
  if (type === 'RESTOCK' || type === 'OPENING') return COLORS.revenue;
  if (type === 'CONSUMPTION') return COLORS.danger;
  return COLORS.pending;
}

function movementTitle(type) {
  return TYPE_LABELS[type] || type;
}

function formatDate(value) {
  if (!value) return '\u2014';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '\u2014';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function HistoryModal({ item, onClose }) {
  const [movements, setMovements] = useState(null);
  const [cycles, setCycles] = useState(null);
  const [error, setError] = useState(null);

  useEffect(function () {
    let mounted = true;
    Promise.all([getMovements({ ingredientId: item._id, limit: 200 }), getCycles(item._id)])
      .then(function (results) {
        if (mounted) {
          setMovements(results[0]);
          setCycles(results[1]);
        }
      })
      .catch(function (historyError) {
        if (mounted) setError(getErrorMessage(historyError, 'Failed to load history'));
      });
    return function () {
      mounted = false;
    };
  }, [item._id]);

  function renderMovement({ entry }) {
    const positive = entry.quantityDelta > 0;
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Text style={[styles.type, { color: typeColor(entry.type) }]}>{movementTitle(entry.type)}</Text>
          <Text style={styles.meta}>
            {formatDate(entry.movementDate)} · {entry.note ? entry.note : 'no note'}
          </Text>
        </View>
        <Text style={[styles.delta, positive ? styles.deltaUp : styles.deltaDown]}>
          {positive ? '+' : ''}
          {formatQty(entry.quantityDelta, entry.unit)}
        </Text>
      </View>
    );
  }

  const cycleSummary = Array.isArray(cycles) ? cycles.slice(0, 5) : [];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Stock History</Text>
            <Text style={styles.subtitle}>{item.name}</Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {Array.isArray(cycles) && cycles.length > 0 ? (
            <View style={styles.cycles}>
              <Text style={styles.sectionLabel}>Usage cycles</Text>
              {cycleSummary.map(function (cycle) {
                return (
                  <View key={String(cycle._id)} style={styles.cycleRow}>
                    <Text style={styles.cycleName}>
                      Cycle {cycle.cycleNumber} · {cycle.status === 'OPEN' ? 'current' : 'closed'}
                    </Text>
                    <Text style={styles.cycleMeta}>
                      baseline {formatQty(cycle.baselineQty, item.unit)}
                      {cycle.finalUsagePercent !== null && cycle.finalUsagePercent !== undefined
                        ? ` · used ${cycle.finalUsagePercent}%`
                        : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {movements === null ? (
            <View style={styles.loading}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : (
            <FlatList
              data={Array.isArray(movements) ? movements : []}
              keyExtractor={(entry) => String(entry._id) + String(entry.idempotencyKey || '')}
              renderItem={renderMovement}
              ListEmptyComponent={<Text style={styles.empty}>No movements recorded yet.</Text>}
              style={styles.list}
            />
          )}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    maxHeight: '92%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  header: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  cycles: { padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', marginBottom: SPACING.sm },
  cycleRow: { paddingVertical: SPACING.xs },
  cycleName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  cycleMeta: { fontSize: 12, color: COLORS.muted },
  list: { paddingHorizontal: SPACING.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowLeft: { flex: 1, paddingRight: SPACING.md },
  type: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  delta: { fontSize: 15, fontWeight: '800' },
  deltaUp: { color: COLORS.revenue },
  deltaDown: { color: COLORS.danger },
  errorText: { color: COLORS.danger, fontWeight: '600', padding: SPACING.lg },
  loading: { padding: SPACING.xl, alignItems: 'center' },
  empty: { color: COLORS.muted, textAlign: 'center', padding: SPACING.xl },
  closeBtn: {
    margin: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  closeText: { color: '#ffffff', fontWeight: '700' },
});