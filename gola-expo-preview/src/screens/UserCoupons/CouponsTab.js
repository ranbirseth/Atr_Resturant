import React, { useCallback, useState } from 'react';
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
import CouponFormModal from './CouponFormModal';
import {
  createCoupon,
  deleteCoupon,
  getCoupons,
  updateCoupon,
} from '../../api/userCouponService';
import {
  buildCouponPayload,
  formatDate,
  formatDiscount,
  formatMinOrder,
  getErrorMessage,
} from '../../utils/userCouponUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

// Coupons tab: list every coupon (GET /api/coupons/all) and create new ones
// (POST /api/coupons). Edit/delete use the existing PUT/DELETE endpoints.
export default function CouponsTab() {
  const { width } = useWindowDimensions();
  const [coupons, setCoupons] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async function load(isRefresh) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await getCoupons();
      setCoupons(data);
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load coupons'));
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

  function openCreate() {
    setServerError(null);
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setServerError(null);
  }

  async function handleSubmit(form) {
    if (saving) {
      return;
    }
    setSaving(true);
    setServerError(null);
    setSuccess(null);
    const payload = buildCouponPayload(form);
    try {
      const created = await createCoupon(payload);
      closeModal();
      setSuccess(`Coupon "${(created && created.code) || payload.code}" created.`);
      load(true);
    } catch (saveError) {
      setServerError(getErrorMessage(saveError, 'Failed to create coupon'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(coupon) {
    if (busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setSuccess(null);
    try {
      await updateCoupon(coupon._id, { isActive: !coupon.isActive });
      load(true);
    } catch (toggleError) {
      setActionError(getErrorMessage(toggleError, 'Failed to update coupon'));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(coupon) {
    Alert.alert('Delete coupon', `Delete "${coupon.code}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: function () {
          runDelete(coupon);
        },
      },
    ]);
  }

  async function runDelete(coupon) {
    if (busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setSuccess(null);
    try {
      await deleteCoupon(coupon._id);
      load(true);
    } catch (deleteError) {
      setActionError(getErrorMessage(deleteError, 'Failed to delete coupon'));
    } finally {
      setBusy(false);
    }
  }

  const columns = width >= 1000 ? 3 : width >= 680 ? 2 : 1;

  function renderCard({ item }) {
    const active = item.isActive !== false;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.code} numberOfLines={1}>
            {item.code}
          </Text>
          <View style={[styles.badge, active ? styles.badgeActive : styles.badgeMuted]}>
            <Text style={[styles.badgeText, active ? styles.badgeTextActive : styles.badgeTextMuted]}>
              {active ? 'Active' : 'Disabled'}
            </Text>
          </View>
        </View>

        <Text style={styles.discount}>{formatDiscount(item)}</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Min Order</Text>
          <Text style={styles.infoValue}>{formatMinOrder(item)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Created</Text>
          <Text style={styles.infoValue}>{formatDate(item.createdAt)}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, busy && styles.disabled]}
            onPress={() => toggleStatus(item)}
            disabled={busy}>
            <Text style={styles.actionText}>{active ? 'Disable' : 'Enable'}</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.deleteBtn, busy && styles.disabled]}
            onPress={() => confirmDelete(item)}
            disabled={busy}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loading) {
    return <StateView mode="loading" message="Loading coupons…" />;
  }
  if (error) {
    return <StateView mode="error" message={error} onRetry={onRetry} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        key={columns}
        data={Array.isArray(coupons) ? coupons : []}
        keyExtractor={(item) => String(item._id || item.code)}
        numColumns={columns}
        renderItem={renderCard}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View>
            <View style={styles.toolbar}>
              <Text style={styles.heading}>Coupons</Text>
              <Pressable style={styles.addButton} onPress={openCreate}>
                <Text style={styles.addButtonText}>+ Create Coupon</Text>
              </Pressable>
            </View>
            {success ? <Text style={styles.success}>{success}</Text> : null}
            {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <StateView mode="empty" message="No coupons yet. Create your first coupon." />
        }
      />

      {modalVisible ? (
        <CouponFormModal
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
  success: {
    color: COLORS.revenue,
    backgroundColor: '#e7f6ec',
    fontWeight: '700',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  code: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
    color: COLORS.text,
  },
  badge: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  badgeActive: { backgroundColor: '#e7f6ec' },
  badgeMuted: { backgroundColor: COLORS.background },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextActive: { color: COLORS.revenue },
  badgeTextMuted: { color: COLORS.muted },
  discount: {
    marginTop: SPACING.sm,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accent,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
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
  disabled: {
    opacity: 0.6,
  },
});
