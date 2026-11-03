import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getCategories, getItems } from '../../api/menuService';
import { createPosBill, recordPayment } from '../../api/billService';
import {
  addItem,
  canGenerateBill,
  cartTotals,
  decrementItem,
  incrementItem,
  isItemSellable,
  removeItem,
} from '../../utils/billingUtils';
import {
  cartForAudience,
  makeIdempotencyKey,
} from '../../utils/audienceBilling';
import {
  audiencePrice,
  categoryKey,
  formatPrice,
  getErrorMessage,
} from '../../utils/menuUtils';
import { billingErrorMessage } from '../../utils/billUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
];

async function fetchStaffMenu() {
  const [items, categories] = await Promise.all([
    getItems('staff'),
    getCategories(),
  ]);
  const hiddenCategories = new Set(
    categories
      .filter((category) => category && category.staffVisible === false)
      .map((category) => categoryKey(category.name)),
  );
  return items.filter(
    (item) =>
      item &&
      item.availableForStaff !== false &&
      !hiddenCategories.has(categoryKey(item.category)),
  );
}

export default function StaffCart({ onCheckoutComplete }) {
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [loadingItems, setLoadingItems] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [checkoutBill, setCheckoutBill] = useState(null);
  const [checkoutKey, setCheckoutKey] = useState(() => makeIdempotencyKey('dashboard-pos'));
  const [paymentKey, setPaymentKey] = useState(null);
  const submittingRef = useRef(false);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      setItems(await fetchStaffMenu());
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Could not load menu items.'));
    } finally {
      setLoadingItems(false);
    }
  }, []);

  function retryItems() {
    setLoadingItems(true);
    loadItems();
  }

  useEffect(() => {
    let active = true;
    fetchStaffMenu()
      .then((data) => {
        if (active) {
          setItems(data);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError, 'Could not load menu items.'));
        }
      })
      .finally(() => {
        if (active) {
          setLoadingItems(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const displayCart = useMemo(() => cartForAudience(cart, 'STAFF'), [cart]);
  const totals = useMemo(() => cartTotals(displayCart), [displayCart]);
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const name = typeof item?.name === 'string' ? item.name.toLowerCase() : '';
      return isItemSellable(item) && (!needle || name.includes(needle));
    });
  }, [items, query]);
  const cartEditable = !checkoutBill && !submitting;

  function updateCart(updater) {
    if (!cartEditable) {
      return;
    }
    setCart(updater);
    setCheckoutKey(makeIdempotencyKey('dashboard-pos'));
    setError(null);
  }

  async function handlePay() {
    if (submittingRef.current) {
      return;
    }
    if (!canGenerateBill(cart)) {
      setError('Add at least one menu item before checkout.');
      return;
    }
    if (totals.subtotal <= 0) {
      setError('The cart total must be greater than zero to record payment.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      let bill = checkoutBill;
      let activePaymentKey = paymentKey;
      if (!bill) {
        bill = await createPosBill(
          'STAFF',
          cart.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
          })),
          checkoutKey,
        );
        if (!bill?._id || !(Number(bill.totalAmount) > 0)) {
          throw new Error('The server returned an invalid POS bill.');
        }
        setCheckoutBill(bill);
        activePaymentKey = makeIdempotencyKey('dashboard-payment');
        setPaymentKey(activePaymentKey);
      }

      if (!activePaymentKey) {
        activePaymentKey = makeIdempotencyKey('dashboard-payment');
        setPaymentKey(activePaymentKey);
      }
      const result = await recordPayment(bill._id, {
        amount: bill.balanceDue ?? bill.totalAmount,
        method: paymentMethod,
        idempotencyKey: activePaymentKey,
      });

      setCart([]);
      setCheckoutBill(null);
      setCheckoutKey(makeIdempotencyKey('dashboard-pos'));
      setPaymentKey(null);
      setQuery('');
      const revenueRefreshed = await onCheckoutComplete(result);
      Alert.alert(
        'Payment successful',
        revenueRefreshed
          ? 'Staff cart cleared and Dashboard revenue refreshed.'
          : 'Staff cart cleared. Payment succeeded, but Dashboard revenue could not be refreshed; use Dashboard refresh to retry.',
      );
    } catch (checkoutError) {
      setError(
        billingErrorMessage(
          checkoutError,
          'Payment could not be completed. Retry to safely continue this checkout.',
        ),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Staff Cart</Text>
      <Text style={styles.subtitle}>Staff-priced menu items · payment is recorded to the POS bill.</Text>

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search menu items"
        placeholderTextColor={COLORS.muted}
        editable={cartEditable}
      />

      {loadingItems ? (
        <ActivityIndicator style={styles.loading} color={COLORS.accent} />
      ) : items.length === 0 ? (
        <View style={styles.noticeRow}>
          <Text style={styles.emptyText}>No menu items available.</Text>
          <Pressable onPress={retryItems} disabled={loadingItems}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.menuList}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}>
          {filteredItems.map((item) => (
            <View key={String(item._id)} style={styles.menuRow}>
              <View style={styles.nameWrap}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.itemPrice}>{formatPrice(audiencePrice(item, 'STAFF'))}</Text>
              </View>
              <Pressable
                style={[styles.addButton, !cartEditable && styles.disabledButton]}
                onPress={() => updateCart((previous) => addItem(previous, item))}
                disabled={!cartEditable}
                accessibilityRole="button"
                accessibilityLabel={'Add ' + item.name}>
                <Text style={styles.addButtonText}>+ Add</Text>
              </Pressable>
            </View>
          ))}
          {filteredItems.length === 0 ? (
            <Text style={styles.emptyText}>No items match that search.</Text>
          ) : null}
        </ScrollView>
      )}

      <Text style={styles.cartHeading}>Current cart</Text>
      {displayCart.length === 0 ? (
        <Text style={styles.emptyText}>Cart is empty. Add items to begin.</Text>
      ) : (
        displayCart.map((line) => (
          <View key={line.itemId} style={styles.cartRow}>
            <View style={styles.nameWrap}>
              <Text style={styles.itemName} numberOfLines={1}>{line.name}</Text>
              <Text style={styles.itemPrice}>
                {formatPrice(line.price)} × {line.quantity}
              </Text>
            </View>
            <Pressable
              style={[styles.quantityButton, !cartEditable && styles.disabledButton]}
              onPress={() => updateCart((previous) => decrementItem(previous, line.itemId))}
              disabled={!cartEditable}
              accessibilityRole="button"
              accessibilityLabel={'Decrease ' + line.name}>
              <Text style={styles.quantityText}>−</Text>
            </Pressable>
            <Text style={styles.quantity}>{line.quantity}</Text>
            <Pressable
              style={[styles.quantityButton, !cartEditable && styles.disabledButton]}
              onPress={() => updateCart((previous) => incrementItem(previous, line.itemId))}
              disabled={!cartEditable}
              accessibilityRole="button"
              accessibilityLabel={'Increase ' + line.name}>
              <Text style={styles.quantityText}>+</Text>
            </Pressable>
            <Pressable
              style={styles.removeButton}
              onPress={() => updateCart((previous) => removeItem(previous, line.itemId))}
              disabled={!cartEditable}
              accessibilityRole="button"
              accessibilityLabel={'Remove ' + line.name}>
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Cart total</Text>
        <Text style={styles.totalValue}>{formatPrice(totals.subtotal)}</Text>
      </View>

      <Text style={styles.methodLabel}>Payment method</Text>
      <View style={styles.methodRow}>
        {PAYMENT_METHODS.map((method) => {
          const selected = method.value === paymentMethod;
          return (
            <Pressable
              key={method.value}
              onPress={() => {
                if (!checkoutBill) {
                  setPaymentMethod(method.value);
                  setPaymentKey(null);
                }
              }}
              style={[styles.methodChip, selected && styles.methodChipSelected]}
              disabled={Boolean(checkoutBill) || submitting}
              accessibilityRole="button"
              accessibilityState={{ selected }}>
              <Text style={[styles.methodText, selected && styles.methodTextSelected]}>
                {method.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {checkoutBill ? (
        <Text style={styles.pendingText}>
          Payment is pending for bill {checkoutBill.billNumber}. Retry to finish checkout.
        </Text>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={[
          styles.payButton,
          (!canGenerateBill(cart) || totals.subtotal <= 0 || submitting) && styles.disabledButton,
        ]}
        onPress={handlePay}
        disabled={!canGenerateBill(cart) || totals.subtotal <= 0 || submitting}
        accessibilityRole="button">
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.payButtonText}>
            {checkoutBill ? 'Retry Payment' : `Pay ${formatPrice(totals.subtotal)}`}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    marginTop: SPACING.xs,
    fontSize: 12,
    color: COLORS.muted,
  },
  search: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  loading: {
    marginVertical: SPACING.lg,
  },
  menuList: {
    maxHeight: 220,
    marginTop: SPACING.sm,
  },
  menuRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  nameWrap: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  itemPrice: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.muted,
  },
  addButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  cartHeading: {
    marginTop: SPACING.lg,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptyText: {
    marginTop: SPACING.sm,
    fontSize: 12,
    color: COLORS.muted,
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.xs,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
  },
  quantityText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  quantity: {
    minWidth: 18,
    textAlign: 'center',
    fontWeight: '700',
    color: COLORS.text,
  },
  removeButton: {
    width: 28,
    alignItems: 'center',
  },
  removeText: {
    color: COLORS.danger,
    fontSize: 22,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
  },
  totalLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  totalValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },
  methodLabel: {
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  methodRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  methodChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.background,
  },
  methodChipSelected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  methodText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  methodTextSelected: {
    color: '#ffffff',
  },
  pendingText: {
    marginTop: SPACING.md,
    color: COLORS.pending,
    fontSize: 12,
  },
  errorText: {
    marginTop: SPACING.md,
    color: COLORS.danger,
    fontSize: 12,
  },
  payButton: {
    marginTop: SPACING.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.revenue,
  },
  payButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.5,
  },
  noticeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  retryText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
  },
});
