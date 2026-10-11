import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS, RADIUS, SPACING } from '../../theme';
import {
  MAX_QUANTITY,
  formatCurrency,
  lineTotal,
} from '../../utils/billingUtils';
import { AUDIENCES, audienceLabel, normalizeAudience } from '../../utils/audienceBilling';

const AUDIENCE_BLURB = {
  CUSTOMER: 'Current menu price.',
  STAFF: '60% of the customer menu price.',
};

// Bill/cart panel for the POS screen. Pure presentation: all state lives in the
// BillingScreen container. Rendered inline on wide (tablet) layouts and inside
// a Modal on narrow layouts.
//
// `cart` arrives already priced for the selected audience (see
// audienceBilling.cartForAudience), so line prices and totals update live when
// the selection changes. Creating a bill is blocked until an audience is chosen
// - new checkouts never silently default to Customer.
export default function BillPanel({
  cart,
  totals,
  audience,
  onSelectAudience,
  onIncrement,
  onDecrement,
  onRemove,
  onClearCart,
  onGenerate,
  generateError,
  creating,
}) {
  const selected = normalizeAudience(audience);
  const canGenerate = totals.lineCount > 0 && selected !== null && !creating;

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

      <View style={styles.audienceBox}>
        <Text style={styles.sectionLabel}>Who is this bill for?</Text>
        <View style={styles.audienceRow}>
          {AUDIENCES.map(function (value) {
            const active = selected === value;
            const disabled = creating;
            return (
              <Pressable
                key={value}
                onPress={() => onSelectAudience(value)}
                disabled={disabled}
                style={[styles.audienceChip, active && styles.audienceChipActive, disabled && styles.audienceChipDisabled]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={'Bill for ' + audienceLabel(value)}>
                <Text style={[styles.audienceChipText, active && styles.audienceChipTextActive]}>
                  {audienceLabel(value)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.audienceHint}>
          {selected
            ? audienceLabel(selected) + ' pricing \u00b7 ' + AUDIENCE_BLURB[selected]
            : 'Select Customer or Staff before creating the bill.'}
        </Text>
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

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            Subtotal ({totals.unitCount} item{totals.unitCount === 1 ? '' : 's'})
          </Text>
          <Text style={styles.totalValue}>{formatCurrency(totals.subtotal)}</Text>
        </View>
        <View style={[styles.totalRow, styles.grandRow]}>
          <Text style={styles.grandLabel}>Final Payable</Text>
          <Text style={styles.grandValue}>{formatCurrency(totals.subtotal)}</Text>
        </View>
        <Text style={styles.taxNote}>
          No tax, service charge, or surcharge is added. Prices are calculated by the
          server when the bill is created.
        </Text>
      </View>

      {generateError ? <Text style={styles.generateError}>{generateError}</Text> : null}

      <Pressable
        style={[styles.generateButton, !canGenerate && styles.generateButtonDisabled]}
        onPress={onGenerate}
        disabled={!canGenerate}
        accessibilityRole="button">
        {creating ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.generateButtonText}>Create Bill</Text>
        )}
      </Pressable>
      <Text style={styles.generateHint}>
        {totals.lineCount === 0
          ? 'Add at least one item to create a bill.'
          : selected
            ? 'Saved on the server with ' + audienceLabel(selected) + ' pricing.'
            : 'Choose Customer or Staff to enable bill creation.'}
      </Text>
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
  audienceBox: {
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
  audienceRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  audienceChip: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  audienceChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  audienceChipDisabled: {
    opacity: 0.5,
  },
  audienceChipText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  audienceChipTextActive: {
    color: '#ffffff',
  },
  audienceHint: {
    marginTop: SPACING.sm,
    fontSize: 12,
    color: COLORS.muted,
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
