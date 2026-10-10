import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
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
import AddItemModal from './AddItemModal';
import { createIngredient, deleteIngredient, getIngredients, getUnits } from '../../api/inventoryService';
import { formatQty, getErrorMessage } from '../../utils/inventoryUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

// Inventory section: a simple list of purchased items plus one "Add Inventory"
// action. The add form captures only name, unit, total quantity and total price.
export default function InventoryScreen() {
  const { width } = useWindowDimensions();
  const [items, setItems] = useState(null);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
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

  const columns = width >= 1000 ? 3 : width >= 680 ? 2 : 1;

  function openCreate() {
    setServerError(null);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setServerError(null);
  }

  async function handleAdd(payload) {
    setSaving(true);
    setServerError(null);
    try {
      await createIngredient(payload);
      closeModal();
      load(true);
    } catch (saveError) {
      setServerError(getErrorMessage(saveError, 'Failed to add inventory'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(item) {
    Alert.alert(
      'Delete inventory item',
      `Delete "${item.name}"? Items that already have stock history are archived (kept for records) instead of removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => runDelete(item) },
      ],
    );
  }

  async function runDelete(item) {
    if (deletingId) {
      return;
    }
    setDeletingId(item._id);
    try {
      const result = await deleteIngredient(item._id);
      load(true);
      const title = result && result.archived ? 'Item archived' : 'Item deleted';
      const message = (result && result.message) || (result && result.archived ? 'Kept to preserve stock history.' : 'Removed.');
      Alert.alert(title, message);
    } catch (deleteError) {
      Alert.alert('Delete failed', getErrorMessage(deleteError, 'Failed to delete item'));
    } finally {
      setDeletingId(null);
    }
  }

  function renderCard({ item }) {
    const deleting = deletingId === item._id;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.badges}>
            {item.isActive === false ? <Text style={styles.archivedPill}>Archived</Text> : null}
            <Text style={styles.unitPill}>{item.unit}</Text>
          </View>
        </View>
        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>In stock</Text>
          <Text style={styles.qtyValue}>{formatQty(item.currentQty, item.unit)}</Text>
        </View>
        <Pressable
          style={[styles.deleteBtn, deleting && styles.disabled]}
          disabled={deleting}
          onPress={() => confirmDelete(item)}>
          <Text style={styles.deleteText}>{deleting ? 'Removing…' : 'Delete'}</Text>
        </Pressable>
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
        data={Array.isArray(items) ? items : []}
        keyExtractor={(item) => String(item._id)}
        numColumns={columns}
        renderItem={renderCard}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        ListHeaderComponent={
          <Pressable style={styles.addButton} onPress={openCreate}>
            <Text style={styles.addButtonText}>+ Add Inventory</Text>
          </Pressable>
        }
        ListEmptyComponent={<StateView mode="empty" message="No items yet. Tap Add Inventory to record a purchase." />}
      />

      {modalVisible ? (
        <AddItemModal
          units={units}
          saving={saving}
          serverError={serverError}
          onClose={closeModal}
          onSubmit={handleAdd}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  columns: { gap: SPACING.lg },
  addButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  addButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
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
  badges: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs },
  archivedPill: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    backgroundColor: COLORS.barTrack,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
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
  deleteBtn: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBg,
  },
  deleteText: { color: COLORS.danger, fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.6 },
});