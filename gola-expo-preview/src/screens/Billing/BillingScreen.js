import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import StateView from '../../components/menu/StateView';
import BillPanel from './BillPanel';
import BillPreviewModal from './BillPreviewModal';
import { getItems } from '../../api/menuService';
import { validateCoupon } from '../../api/billingService';
import { formatPrice, getErrorMessage } from '../../utils/menuUtils';
import {
  addItem,
  canGenerateBill,
  cartQuantity,
  clearCart,
  computePayable,
  decrementItem,
  incrementItem,
  isItemSellable,
  removeItem,
  sanitizeDiscount,
  cartTotals,
} from '../../utils/billingUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

const WIDE_MIN_WIDTH = 900;

// POS Billing screen: pick customer menu items, build a bill, and review a local
// preview. It never creates a backend order or records a payment (see docs).
export default function BillingScreen() {
  const { width } = useWindowDimensions();
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [cartModalVisible, setCartModalVisible] = useState(false);

  const load = useCallback(async function load(isRefresh) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await getItems('customer');
      setItems(data);
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load menu'));
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

  const categoryNames = useMemo(
    function () {
      const seen = {};
      const names = [];
      (Array.isArray(items) ? items : []).forEach(function (item) {
        const name = item && typeof item.category === 'string' ? item.category.trim() : '';
        const key = name.toLowerCase();
        if (name && !seen[key]) {
          seen[key] = true;
          names.push(name);
        }
      });
      return names;
    },
    [items],
  );

  const filtered = useMemo(
    function () {
      const list = Array.isArray(items) ? items : [];
      const needle = query.trim().toLowerCase();
      return list.filter(function (item) {
        if (!item) {
          return false;
        }
        const name = typeof item.name === 'string' ? item.name.toLowerCase() : '';
        const matchesQuery = !needle || name.includes(needle);
        const matchesCategory =
          categoryFilter === 'All' ||
          (typeof item.category === 'string' &&
            item.category.trim().toLowerCase() === categoryFilter.toLowerCase());
        return matchesQuery && matchesCategory;
      });
    },
    [items, query, categoryFilter],
  );

  const totals = useMemo(() => cartTotals(cart), [cart]);
  const discount = appliedCoupon
    ? sanitizeDiscount(appliedCoupon.discountAmount, totals.subtotal)
    : 0;
  const payable = computePayable(totals.subtotal, discount);

  const isWide = width >= WIDE_MIN_WIDTH;
  const menuColumns = width >= 1280 ? 3 : width >= 680 ? 2 : 1;

  // Any cart change invalidates a previously applied coupon (the server-verified
  // discount may no longer match the new subtotal).
  function mutateCart(updater) {
    setCart(updater);
    if (appliedCoupon) {
      setAppliedCoupon(null);
      setCouponError('Cart changed — re-apply the coupon to recalculate.');
    }
    setGenerateError(null);
  }

  function handleAdd(item) {
    mutateCart(function (prev) {
      return addItem(prev, item);
    });
  }

  function handleIncrement(itemId) {
    mutateCart(function (prev) {
      return incrementItem(prev, itemId);
    });
  }

  function handleDecrement(itemId) {
    mutateCart(function (prev) {
      return decrementItem(prev, itemId);
    });
  }

  function handleRemove(itemId) {
    mutateCart(function (prev) {
      return removeItem(prev, itemId);
    });
  }

  function confirmClear() {
    Alert.alert('Clear bill', 'Remove all items from the current bill?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: function () {
          mutateCart(function () {
            return clearCart();
          });
        },
      },
    ]);
  }

  async function handleApplyCoupon() {
    if (!couponInput.trim()) {
      setCouponError('Enter a coupon code.');
      return;
    }
    if (totals.lineCount === 0) {
      setCouponError('Add items before applying a coupon.');
      return;
    }
    setCouponLoading(true);
    setCouponError(null);
    try {
      const result = await validateCoupon(couponInput, totals.subtotal);
      setAppliedCoupon({
        code: result && result.code ? result.code : couponInput.trim().toUpperCase(),
        discountAmount: result ? result.discountAmount : 0,
        discountType: result ? result.discountType : undefined,
        value: result ? result.value : undefined,
      });
    } catch (couponFailure) {
      setAppliedCoupon(null);
      setCouponError(getErrorMessage(couponFailure, 'Coupon could not be applied.'));
    } finally {
      setCouponLoading(false);
    }
  }

  function handleClearCoupon() {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput('');
  }

  // Local preview only: no POST /api/orders, no persistence, no payment.
  function handleGenerate() {
    if (previewVisible) {
      return;
    }
    if (!canGenerateBill(cart)) {
      setGenerateError('Add at least one valid item before generating a bill.');
      return;
    }
    setGenerateError(null);
    setCartModalVisible(false);
    setPreviewVisible(true);
  }

  function renderMenuCard({ item }) {
    const sellable = isItemSellable(item);
    const qty = cartQuantity(cart, item._id);
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={[styles.badge, item.isVeg === false ? styles.nonVegBadge : styles.vegBadge]}>
            <Text style={[styles.badgeText, item.isVeg === false ? styles.nonVegText : styles.vegText]}>
              {item.isVeg === false ? 'Non-Veg' : 'Veg'}
            </Text>
          </View>
        </View>

        <Text style={styles.cardCategory}>{item.category}</Text>
        <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
        <Text style={[styles.cardAvail, !sellable && styles.cardAvailOff]}>
          {item.available === false ? 'Unavailable' : 'Available'}
        </Text>

        {!sellable ? (
          <View style={styles.addButtonDisabled}>
            <Text style={styles.addButtonDisabledText}>Unavailable</Text>
          </View>
        ) : qty === 0 ? (
          <Pressable
            style={styles.addButton}
            onPress={() => handleAdd(item)}
            accessibilityRole="button"
            accessibilityLabel={'Add ' + item.name}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </Pressable>
        ) : (
          <View style={styles.cardStepper}>
            <Pressable
              style={styles.cardStep}
              onPress={() => handleDecrement(item._id)}
              accessibilityRole="button"
              accessibilityLabel={'Decrease ' + item.name}>
              <Text style={styles.cardStepText}>{'\u2212'}</Text>
            </Pressable>
            <Text style={styles.cardQty}>{qty}</Text>
            <Pressable
              style={styles.cardStep}
              onPress={() => handleIncrement(item._id)}
              accessibilityRole="button"
              accessibilityLabel={'Increase ' + item.name}>
              <Text style={styles.cardStepText}>+</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  if (loading && items === null) {
    return <StateView mode="loading" message="Loading menu…" />;
  }
  if (error && items === null) {
    return <StateView mode="error" message={error} onRetry={onRetry} />;
  }

  function renderBillPanel() {
    return (
      <BillPanel
        cart={cart}
        totals={totals}
        discount={discount}
        payable={payable}
        couponInput={couponInput}
        appliedCoupon={appliedCoupon}
        couponError={couponError}
        couponLoading={couponLoading}
        onCouponInputChange={setCouponInput}
        onApplyCoupon={handleApplyCoupon}
        onClearCoupon={handleClearCoupon}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
        onRemove={handleRemove}
        onClearCart={confirmClear}
        onGenerate={handleGenerate}
        generateError={generateError}
      />
    );
  }

  const hasAnyItem = Array.isArray(items) && items.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Gola Restaurant {'\u2014'} Billing</Text>
        <Text style={styles.headerSubtitle}>
          Point of sale {'\u00b7'} local preview only {'\u00b7'} payment not recorded
        </Text>
      </View>

      <View style={isWide ? styles.bodyWide : styles.bodyNarrow}>
        <View style={styles.menuPane}>
          <FlatList
            key={menuColumns}
            data={filtered}
            keyExtractor={(item) => String(item._id)}
            numColumns={menuColumns}
            renderItem={renderMenuCard}
            columnWrapperStyle={menuColumns > 1 ? styles.columns : undefined}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View>
                <TextInput
                  style={styles.search}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search menu items…"
                  placeholderTextColor={COLORS.muted}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}>
                  {['All'].concat(categoryNames).map(function (name) {
                    const active = categoryFilter === name;
                    return (
                      <Pressable
                        key={name}
                        onPress={() => setCategoryFilter(name)}
                        style={[styles.chip, active && styles.chipActive]}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
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
              </View>
            }
            ListEmptyComponent={
              <StateView
                mode="empty"
                message={
                  hasAnyItem
                    ? 'No items match your search or filter.'
                    : 'No menu items are available.'
                }
              />
            }
          />
        </View>

        {isWide ? <View style={styles.panelPane}>{renderBillPanel()}</View> : null}
      </View>

      {!isWide ? (
        <View style={styles.bottomBar}>
          <View style={styles.bottomInfo}>
            <Text style={styles.bottomCount}>
              {totals.unitCount} item{totals.unitCount === 1 ? '' : 's'}
            </Text>
            <Text style={styles.bottomTotal}>{formatPrice(payable)}</Text>
          </View>
          <Pressable
            style={styles.bottomButton}
            onPress={() => setCartModalVisible(true)}
            accessibilityRole="button">
            <Text style={styles.bottomButtonText}>View Bill</Text>
          </Pressable>
        </View>
      ) : null}

      {!isWide ? (
        <Modal
          visible={cartModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCartModalVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalBody}>{renderBillPanel()}</View>
              <Pressable
                style={styles.modalClose}
                onPress={() => setCartModalVisible(false)}
                accessibilityRole="button">
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}

      <BillPreviewModal
        visible={previewVisible}
        cart={cart}
        totals={totals}
        discount={discount}
        payable={payable}
        appliedCoupon={appliedCoupon}
        onClose={() => setPreviewVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  headerSubtitle: {
    marginTop: SPACING.xs,
    fontSize: 13,
    color: COLORS.muted,
  },
  bodyWide: {
    flex: 1,
    flexDirection: 'row',
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  bodyNarrow: {
    flex: 1,
  },
  menuPane: {
    flex: 1,
  },
  panelPane: {
    width: 380,
  },
  columns: {
    gap: SPACING.md,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  search: {
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  chipRow: {
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
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
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  cardName: {
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
  cardCategory: {
    marginTop: SPACING.xs,
    fontSize: 13,
    color: COLORS.muted,
  },
  cardPrice: {
    marginTop: SPACING.sm,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  cardAvail: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.revenue,
  },
  cardAvailOff: {
    color: COLORS.danger,
  },
  addButton: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  addButtonDisabled: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addButtonDisabledText: {
    color: COLORS.muted,
    fontWeight: '700',
    fontSize: 15,
  },
  cardStepper: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
  },
  cardStep: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
  },
  cardStepText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 24,
  },
  cardQty: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.md,
  },
  bottomInfo: {
    flex: 1,
  },
  bottomCount: {
    fontSize: 12,
    color: COLORS.muted,
  },
  bottomTotal: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  bottomButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.revenue,
  },
  bottomButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    height: '80%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  modalBody: {
    flex: 1,
  },
  modalClose: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  modalCloseText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
