import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { COLORS, RADIUS, SPACING } from '../../theme';
import {
  MAX_QUANTITY,
  formatCurrency,
  lineTotal,
} from '../../utils/billingUtils';

// Bill/cart panel for the POS screen. Pure presentation: all state lives in the
// BillingScreen container. Rendered inline on wide (tablet) layouts and inside
// a Modal on narrow layouts.
export default function BillPanel({
  cart,
  totals,
  discount,
  payable,
  couponInput,
  appliedCoupon,
  couponError,
  couponLoading,
  onCouponInputChange,
  onApplyCoupon,
  onClearCoupon,
  onIncrement,
  onDecrement,
  onRemove,
  onClearCart,
  onGenerate,
  generateError,
}) {
  const canGenerate = totals.lineCount > 0;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Current Bill</Text>
        {totals.lineCount > 0 ? (
          <Pressable
            style={styles.clearButton}
            onPress={onClearCart}
            accessibilityRole="button"
            accessibilityLabel="Clear cart">
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {cart.length === 0 ? (
        <View style={styles.emptyCart}>
          <Text style={styles.emptyCartTitle}>Cart is empty</Text>
          <Text style={styles.emptyCartText}>
            Tap a menu item and press Add to build this bill.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.lines} contentContainerStyle={styles.linesContent}>
          {cart.map(function (line) {
            return (
              <View key={line.itemId} style={styles.line}>
                <View style={styles.lineTop}>
                  <Text style={styles.lineName} numberOfLines={2}>
                    {line.name}
                  </Text>
                  <Pressable
                    style={styles.removeButton}
                    onPress={() => onRemove(line.itemId)}
                    accessibilityRole="button"
                    accessibilityLabel={'Remove ' + line.name}>
                    <Text style={styles.removeButtonText}>{'\u00d7'}</Text>
                  </Pressable>
                </View>
                <Text style={styles.lineUnit}>{formatCurrency(line.price)} each</Text>
                <View style={styles.lineBottom}>
                  <View style={styles.stepper}>
                    <Pressable
                      style={styles.stepButton}
                      onPress={() => onDecrement(line.itemId)}
                      accessibilityRole="button"
                      accessibilityLabel={'Decrease ' + line.name}>
                      <Text style={styles.stepButtonText}>{'\u2212'}</Text>
                    </Pressable>
                    <Text style={styles.qty}>{line.quantity}</Text>
                    <Pressable
                      style={[
                        styles.stepButton,
                        line.quantity >= MAX_QUANTITY && styles.stepButtonDisabled,
                      ]}
                      onPress={() => onIncrement(line.itemId)}
                      disabled={line.quantity >= MAX_QUANTITY}
                      accessibilityRole="button"
                      accessibilityLabel={'Increase ' + line.name}>
                      <Text style={styles.stepButtonText}>+</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.lineTotal}>{formatCurrency(lineTotal(line))}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.couponBox}>
        <Text style={styles.sectionLabel}>Coupon (optional)</Text>
        <View style={styles.couponRow}>
          <TextInput
            style={styles.couponInput}
            value={couponInput}
            onChangeText={onCouponInputChange}
            placeholder="Enter code"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="characters"
            editable={!appliedCoupon && !couponLoading}
          />
          {appliedCoupon ? (
            <Pressable
              style={styles.couponClear}
              onPress={onClearCoupon}
              accessibilityRole="button">
              <Text style={styles.couponClearText}>Remove</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.couponApply, couponLoading && styles.couponApplyDisabled]}
              onPress={onApplyCoupon}
              disabled={couponLoading || cart.length === 0}
              accessibilityRole="button">
              {couponLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.couponApplyText}>Apply</Text>
              )}
            </Pressable>
          )}
        </View>
        {appliedCoupon ? (
          <Text style={styles.couponSuccess}>
            {appliedCoupon.code} applied ({'-' + formatCurrency(discount)})
          </Text>
        ) : null}
        {couponError ? <Text style={styles.couponError}>{couponError}</Text> : null}
      </View>

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            Subtotal ({totals.unitCount} item{totals.unitCount === 1 ? '' : 's'})
          </Text>
          <Text style={styles.totalValue}>{formatCurrency(totals.subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Discount</Text>
          <Text style={styles.totalValue}>
            {discount > 0 ? '-' + formatCurrency(discount) : formatCurrency(0)}
          </Text>
        </View>
        <View style={[styles.totalRow, styles.grandRow]}>
          <Text style={styles.grandLabel}>Final Payable</Text>
          <Text style={styles.grandValue}>{formatCurrency(payable)}</Text>
        </View>
        <Text style={styles.taxNote}>
          No tax, service charge, or surcharge is added. Discounts use the verified
          coupon API only.
        </Text>
        <Text style={styles.paymentNote}>Payment not recorded.</Text>
      </View>

      {generateError ? <Text style={styles.generateError}>{generateError}</Text> : null}

      <Pressable
        style={[styles.generateButton, !canGenerate && styles.generateButtonDisabled]}
        onPress={onGenerate}
        disabled={!canGenerate}
        accessibilityRole="button">
        <Text style={styles.generateButtonText}>Generate Bill</Text>
      </Pressable>
      <Text style={styles.generateHint}>Creates a local preview only — nothing is saved.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  clearButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.dangerBg,
  },
  clearButtonText: {
    color: COLORS.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  emptyCart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyCartTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptyCartText: {
    marginTop: SPACING.xs,
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
  },
  lines: {
    flex: 1,
    marginTop: SPACING.md,
  },
  linesContent: {
    paddingBottom: SPACING.sm,
  },
  line: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: SPACING.md,
  },
  lineTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  lineName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  removeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
  },
  removeButtonText: {
    fontSize: 18,
    color: COLORS.danger,
    fontWeight: '700',
    lineHeight: 20,
  },
  lineUnit: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.muted,
  },
  lineBottom: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
  },
  stepButtonDisabled: {
    opacity: 0.4,
  },
  stepButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  qty: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  lineTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  couponBox: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  couponRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  couponInput: {
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
  couponApply: {
    minWidth: 72,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
  },
  couponApplyDisabled: {
    opacity: 0.5,
  },
  couponApplyText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  couponClear: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dangerBg,
  },
  couponClearText: {
    color: COLORS.danger,
    fontWeight: '700',
  },
  couponSuccess: {
    marginTop: SPACING.sm,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.revenue,
  },
  couponError: {
    marginTop: SPACING.sm,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.danger,
  },
  totals: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  totalLabel: {
    fontSize: 14,
    color: COLORS.muted,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  grandRow: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  grandLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  grandValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.revenue,
  },
  taxNote: {
    marginTop: SPACING.sm,
    fontSize: 11,
    color: COLORS.muted,
  },
  paymentNote: {
    marginTop: SPACING.xs,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.pending,
  },
  generateError: {
    marginTop: SPACING.md,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.danger,
  },
  generateButton: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.revenue,
  },
  generateButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  generateButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  generateHint: {
    marginTop: SPACING.sm,
    fontSize: 11,
    color: COLORS.muted,
    textAlign: 'center',
  },
});
