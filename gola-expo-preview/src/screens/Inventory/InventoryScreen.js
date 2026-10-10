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
import IngredientFormModal from './IngredientFormModal';
import {
  createIngredient,
  getIngredients,
  getUnits,
  setIngredientActive,
  updateIngredient,
} from '../../api/inventoryService';
import {
  formatQty,
  getErrorMessage,
  purchaseStatusLabel,
} from '../../utils/inventoryUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

function statusChip(item) {
  if (item.isActive === false) {
    return { label: 'Inactive', style: 'muted' };
  }
  if (item.outOfStock) {
    return { label: 'Out of Stock', style: 'danger' };
  }
  if (item.lowStock) {
    return { label: 'Low Stock', style: 'pending' };
  }
  return { label: 'Available', style: 'good' };
}

export default function InventoryScreen() {
  const { width } = useWindowDimensions();
  const [items, setItems] = useState(null);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async function load(isRefresh) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const results = await Promise.all([getIngredients({}), getUnits()]);
      setItems(results[0]);
      setUnits(results[1]);
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load inventory'));
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
      const list = Array.isArray(items) ? items : [];
      const q = query.trim().toLowerCase();
      if (!q) return list;
      return list.filter((item) => String(item.name || '').toLowerCase().includes(q));
    },
    [items, query],
  );

  const columns = width >= 1000 ? 3 : width >= 680 ? 2 : 1;

  function openCreate() {
    setEditing(null);
    setServerError(null);
    setModalVisible(true);
  }

  function openEdit(item) {
    setEditing(item);
    setServerError(null);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditing(null);
    setServerError(null);
  }

  async function handleSubmit(payload) {
    setSaving(true);
    setServerError(null);
    try {
      if (editing) {
        await updateIngredient(editing._id, payload);
      } else {
        await createIngredient(payload);
      }
      closeModal();
      load(true);
    } catch (saveError) {
      setServerError(getErrorMessage(saveError, 'Failed to save item'));
    } finally {
      setSaving(false);
    }
  }

  function confirmToggle(item) {
    const makeActive = item.isActive === false;
    Alert.alert(
      makeActive ? 'Activate item' : 'Deactivate item',
      makeActive
        ? `Set "${item.name}" active again?`
        : `Deactivate "${item.name}"? Its stock history is kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: makeActive ? 'Activate' : 'Deactivate',
          style: makeActive ? 'default' : 'destructive',
          onPress: function () {
            runToggle(item, makeActive);
          },
        },
      ],
    );
  }

  async function runToggle(item, active) {
    setActionError(null);
    try {
      await setIngredientActive(item._id, active);
      load(true);
    } catch (toggleError) {
      setActionError(getErrorMessage(toggleError, 'Failed to update item'));
    }
  }

  function renderCard({ item }) {
    const chip = statusChip(item);
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={[styles.badge, styles[chip.style]]}>
            <Text style={[styles.badgeText, styles[`${chip.style}Text`]]}>{chip.label}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.meta}>Unit: {item.unit}</Text>
          <Text style={styles.meta}>Min level: {formatQty(item.minimumStockLevel, item.unit)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>Expected demand: {formatQty(item.expectedDemand, item.unit)}</Text>
        </View>

        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>Current quantity</Text>
          <Text style={styles.qtyValue}>{formatQty(item.currentQty, item.unit)}</Text>
        </View>

        {item.suggestedQty > 0 ? (
          <Text style={styles.suggested}>Suggested buy: {formatQty(item.suggestedQty, item.unit)}</Text>
        ) : null}

        {item.purchaseStatus && item.purchaseStatus !== 'NONE' ? (
          <Text style={styles.purchase}>Purchase: {purchaseStatusLabel(item.purchaseStatus)}</Text>
        ) : null}

        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={() => openEdit(item)}>
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, item.isActive === false ? styles.activateBtn : styles.deactivateBtn]}
            onPress={() => confirmToggle(item)}>
            <Text style={item.isActive === false ? styles.activateText : styles.deactivateText}>
              {item.isActive === false ? 'Activate' : 'Deactivate'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loading) {
    return <StateView mode="loading" message="Loading inventory…" />;
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
            <View style={styles.toolbar}>
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder="Search inventory…"
                placeholderTextColor={COLORS.muted}
              />
              <Pressable style={styles.addButton} onPress={openCreate}>
                <Text style={styles.addButtonText}>+ Add Item</Text>
              </Pressable>
            </View>
            {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
          </View>
        }
        ListEmptyComponent={<StateView mode="empty" message="No inventory items yet. Add one to get started." />}
      />

      {modalVisible ? (
        <IngredientFormModal
          key={editing ? editing._id : 'new'}
          ingredient={editing}
          units={units}
          saving={saving}
          serverError={serverError}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  columns: { gap: SPACING.lg },
  toolbar: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  addButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  addButtonText: { color: '#ffffff', fontWeight: '700' },
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  itemName: { flex: 1, fontSize: 16, fontWeight: '800', color: COLORS.text },
  badge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  good: { backgroundColor: '#e7f6ec' },
  goodText: { color: COLORS.revenue },
  pending: { backgroundColor: '#fdf3e3' },
  pendingText: { color: COLORS.pending },
  danger: { backgroundColor: COLORS.dangerBg },
  dangerText: { color: COLORS.danger },
  muted: { backgroundColor: COLORS.barTrack },
  mutedText: { color: COLORS.muted },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.lg, marginTop: SPACING.sm },
  meta: { fontSize: 13, color: COLORS.muted },
  qtyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  qtyLabel: { fontSize: 13, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase' },
  qtyValue: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  suggested: { marginTop: SPACING.sm, fontSize: 12, fontWeight: '700', color: COLORS.pending },
  purchase: { marginTop: SPACING.sm, fontSize: 12, fontWeight: '700', color: COLORS.orders },
  actions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionText: { color: COLORS.text, fontWeight: '700' },
  deactivateBtn: { borderColor: COLORS.dangerBg, backgroundColor: COLORS.dangerBg },
  deactivateText: { color: COLORS.danger, fontWeight: '700' },
  activateBtn: { borderColor: '#e7f6ec', backgroundColor: '#e7f6ec' },
  activateText: { color: COLORS.revenue, fontWeight: '700' },
});
