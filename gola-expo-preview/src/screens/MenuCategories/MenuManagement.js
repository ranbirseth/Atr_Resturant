import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';
import StateView from '../../components/menu/StateView';
import ItemFormModal from './ItemFormModal';
import {
  audiencePrice,
  filterItems,
  formatPrice,
  getErrorMessage,
  hasStaffPrice,
} from '../../utils/menuUtils';
import { createItem, deleteItem, updateItem } from '../../api/menuService';

const VEG_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'veg', label: 'Veg' },
  { key: 'nonveg', label: 'Non-Veg' },
];

export default function MenuManagement({
  items,
  categories,
  loading,
  error,
  refreshing,
  onRefresh,
  onRetry,
  onChanged,
}) {
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [vegFilter, setVegFilter] = useState('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const categoryNames = useMemo(
    function () {
      return (Array.isArray(categories) ? categories : []).map(function (category) {
        return category.name;
      });
    },
    [categories],
  );

  const filtered = useMemo(
    function () {
      return filterItems(items || [], { query, category: categoryFilter, veg: vegFilter });
    },
    [items, query, categoryFilter, vegFilter],
  );

  const columns = width >= 1000 ? 3 : width >= 680 ? 2 : 1;

  function openCreate() {
    setEditingItem(null);
    setServerError(null);
    setModalVisible(true);
  }

  function openEdit(item) {
    setEditingItem(item);
    setServerError(null);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingItem(null);
    setServerError(null);
  }

  async function handleSubmit(payload) {
    setSaving(true);
    setServerError(null);
    try {
      if (editingItem) {
        await updateItem(editingItem._id, payload);
      } else {
        await createItem(payload);
      }
      closeModal();
      onChanged();
    } catch (saveError) {
      setServerError(getErrorMessage(saveError, 'Failed to save item'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(item) {
    Alert.alert('Delete item', `Delete "${item.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: function () {
          runDelete(item);
        },
      },
    ]);
  }

  async function runDelete(item) {
    setActionError(null);
    try {
      await deleteItem(item._id);
      onChanged();
    } catch (deleteError) {
      setActionError(getErrorMessage(deleteError, 'Failed to delete item'));
    }
  }

  function renderCard({ item }) {
    const staffMissing = !hasStaffPrice(item);
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={[styles.badge, item.isVeg === false ? styles.nonVegBadge : styles.vegBadge]}>
            <Text style={[styles.badgeText, item.isVeg === false ? styles.nonVegText : styles.vegText]}>
              {item.isVeg === false ? 'Non-Veg' : 'Veg'}
            </Text>
          </View>
        </View>

        <Text style={styles.category}>{item.category}</Text>

        <View style={styles.priceRow}>
          <View style={styles.priceBlock}>
            <Text style={styles.priceLabel}>Customer</Text>
            <Text style={styles.priceValue}>{formatPrice(audiencePrice(item, 'CUSTOMER'))}</Text>
          </View>
          <View style={styles.priceBlock}>
            <Text style={styles.priceLabel}>Staff</Text>
            <Text style={[styles.priceValue, staffMissing && styles.priceMissing]}>
              {staffMissing ? 'Not set' : formatPrice(audiencePrice(item, 'STAFF'))}
            </Text>
          </View>
        </View>

        {staffMissing ? (
          <Text style={styles.warning}>Staff price needs to be configured</Text>
        ) : null}

        <View style={styles.availabilityRow}>
          <Text style={[styles.availTag, item.available === false && styles.availOff]}>
            {item.available === false ? 'Customer: Off' : 'Customer: On'}
          </Text>
          <Text style={[styles.availTag, item.availableForStaff === false && styles.availOff]}>
            {item.availableForStaff === false ? 'Staff: Off' : 'Staff: On'}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={() => openEdit(item)}>
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.deleteBtn]} onPress={() => confirmDelete(item)}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loading) {
    return <StateView mode="loading" message="Loading menu…" />;
  }
  if (error) {
    return <StateView mode="error" message={error} onRetry={onRetry} />;
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View>
            <View style={styles.toolbar}>
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder="Search items…"
                placeholderTextColor={COLORS.muted}
              />
              <Pressable style={styles.addButton} onPress={openCreate}>
                <Text style={styles.addButtonText}>+ Add Item</Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {['All'].concat(categoryNames).map(function (name) {
                const active = categoryFilter === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => setCategoryFilter(name)}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.vegRow}>
              {VEG_OPTIONS.map(function (option) {
                const active = vegFilter === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setVegFilter(option.key)}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <StateView mode="empty" message="No items match your filters." />
        }
      />

      {modalVisible ? (
        <ItemFormModal
          key={editingItem ? editingItem._id : 'new'}
          item={editingItem}
          categories={categories}
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
  listContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  columns: {
    gap: SPACING.lg,
  },
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
  addButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  chipRow: {
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  vegRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginRight: SPACING.sm,
  },
  chipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  actionError: {
    color: COLORS.danger,
    fontWeight: '600',
    marginTop: SPACING.sm,
  },
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
  itemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  badge: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  vegBadge: { backgroundColor: '#e7f6ec' },
  nonVegBadge: { backgroundColor: COLORS.dangerBg },
  badgeText: { fontSize: 11, fontWeight: '700' },
  vegText: { color: COLORS.revenue },
  nonVegText: { color: COLORS.danger },
  category: {
    marginTop: SPACING.xs,
    fontSize: 13,
    color: COLORS.muted,
  },
  priceRow: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    gap: SPACING.lg,
  },
  priceBlock: { flex: 1 },
  priceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  priceMissing: {
    color: COLORS.pending,
  },
  warning: {
    marginTop: SPACING.sm,
    color: COLORS.pending,
    fontSize: 12,
    fontWeight: '700',
  },
  availabilityRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    flexWrap: 'wrap',
  },
  availTag: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.revenue,
    backgroundColor: '#e7f6ec',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  availOff: {
    color: COLORS.danger,
    backgroundColor: COLORS.dangerBg,
  },
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
  actionText: {
    color: COLORS.text,
    fontWeight: '700',
  },
  deleteBtn: {
    borderColor: COLORS.dangerBg,
    backgroundColor: COLORS.dangerBg,
  },
  deleteText: {
    color: COLORS.danger,
    fontWeight: '700',
  },
});
