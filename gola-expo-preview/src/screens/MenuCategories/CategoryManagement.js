import React, { useState } from 'react';
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
import { COLORS, RADIUS, SPACING } from '../../theme';
import StateView from '../../components/menu/StateView';
import CategoryFormModal from './CategoryFormModal';
import { getErrorMessage, itemCountForCategory } from '../../utils/menuUtils';
import { createCategory, deleteCategory, updateCategory } from '../../api/menuService';

export default function CategoryManagement({
  categories,
  items,
  loading,
  error,
  refreshing,
  onRefresh,
  onRetry,
  onChanged,
}) {
  const { width } = useWindowDimensions();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const columns = width >= 1000 ? 3 : width >= 680 ? 2 : 1;

  function openCreate() {
    setEditingCategory(null);
    setServerError(null);
    setModalVisible(true);
  }

  function openEdit(category) {
    setEditingCategory(category);
    setServerError(null);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingCategory(null);
    setServerError(null);
  }

  async function handleSubmit(payload) {
    setSaving(true);
    setServerError(null);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory._id, payload);
      } else {
        await createCategory(payload);
      }
      closeModal();
      onChanged();
    } catch (saveError) {
      setServerError(getErrorMessage(saveError, 'Failed to save category'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(category) {
    Alert.alert(
      'Delete category',
      `Delete "${category.name}"? A category still used by items cannot be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: function () {
            runDelete(category);
          },
        },
      ],
    );
  }

  async function runDelete(category) {
    setActionError(null);
    try {
      await deleteCategory(category._id);
      onChanged();
    } catch (deleteError) {
      setActionError(getErrorMessage(deleteError, 'Failed to delete category'));
    }
  }

  function renderCard({ item }) {
    const count = itemCountForCategory(items || [], item.name);
    const customerVisible = item.customerVisible !== false && item.isVisible !== false;
    const staffVisible = item.staffVisible !== false;

    return (
      <View style={styles.card}>
        <Text style={styles.name}>{item.name}</Text>

        <View style={styles.tagRow}>
          <Text style={[styles.tag, !customerVisible && styles.tagOff]}>
            {customerVisible ? 'Customers: Visible' : 'Customers: Hidden'}
          </Text>
          <Text style={[styles.tag, !staffVisible && styles.tagOff]}>
            {staffVisible ? 'Staff: Visible' : 'Staff: Hidden'}
          </Text>
        </View>

        <Text style={styles.count}>{count} item{count === 1 ? '' : 's'}</Text>

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
    return <StateView mode="loading" message="Loading categories…" />;
  }
  if (error) {
    return <StateView mode="error" message={error} onRetry={onRetry} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        key={columns}
        data={Array.isArray(categories) ? categories : []}
        keyExtractor={(item) => String(item._id)}
        numColumns={columns}
        renderItem={renderCard}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View>
            <View style={styles.toolbar}>
              <Text style={styles.heading}>Categories</Text>
              <Pressable style={styles.addButton} onPress={openCreate}>
                <Text style={styles.addButtonText}>+ Add Category</Text>
              </Pressable>
            </View>
            {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
          </View>
        }
        ListEmptyComponent={<StateView mode="empty" message="No categories yet. Add one to get started." />}
      />

      {modalVisible ? (
        <CategoryFormModal
          key={editingCategory ? editingCategory._id : 'new'}
          category={editingCategory}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
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
  actionError: {
    color: COLORS.danger,
    fontWeight: '600',
    marginBottom: SPACING.sm,
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
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  tag: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.revenue,
    backgroundColor: '#e7f6ec',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  tagOff: {
    color: COLORS.muted,
    backgroundColor: COLORS.background,
  },
  count: {
    marginTop: SPACING.md,
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '600',
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
