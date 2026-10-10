import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACING } from '../../theme';
import { formatCurrency, lineTotal } from '../../utils/billingUtils';

function previewStamp() {
  return new Date().toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Local-only bill preview. Nothing is persisted and no payment is recorded.
export default function BillPreviewModal({
  visible,
  cart,
  totals,
  discount,
  payable,
  appliedCoupon,
  onClose,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.brand}>Gola Restaurant</Text>
            <Text style={styles.title}>Bill Preview</Text>
            <Text style={styles.stamp}>{previewStamp()}</Text>

            <View style={styles.warning}>
              <Text style={styles.warningTitle}>Preview only — not saved</Text>
              <Text style={styles.warningText}>
                This bill is calculated on the tablet for review. It is not stored, no
                payment is recorded, and no kitchen/customer order is created.
              </Text>
            </View>

            <View style={styles.lines}>
              {cart.map(function (line) {
                return (
                  <View key={line.itemId} style={styles.line}>
                    <Text style={styles.lineName} numberOfLines={2}>
                      {line.quantity} {'\u00d7'} {line.name}
                    </Text>
                    <Text style={styles.lineValue}>{formatCurrency(lineTotal(line))}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.totals}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Subtotal ({totals.unitCount} item{totals.unitCount === 1 ? '' : 's'})
                </Text>
                <Text style={styles.totalValue}>{formatCurrency(totals.subtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Discount{appliedCoupon ? ' (' + appliedCoupon.code + ')' : ''}
                </Text>
                <Text style={styles.totalValue}>
                  {discount > 0 ? '-' + formatCurrency(discount) : formatCurrency(0)}
                </Text>
              </View>
              <View style={[styles.totalRow, styles.grandRow]}>
                <Text style={styles.grandLabel}>Final Payable</Text>
                <Text style={styles.grandValue}>{formatCurrency(payable)}</Text>
              </View>
            </View>

            <Text style={styles.payment}>Payment not recorded.</Text>
          </ScrollView>

          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button">
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  content: {
    paddingBottom: SPACING.md,
  },
  brand: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
  },
  title: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.muted,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stamp: {
    marginTop: SPACING.xs,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
  },
  warning: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.pending,
    backgroundColor: COLORS.background,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.pending,
  },
  warningText: {
    marginTop: SPACING.xs,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.muted,
  },
  lines: {
    marginTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  lineName: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  lineValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  totals: {
    marginTop: SPACING.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  totalLabel: {
    fontSize: 14,
    color: COLORS.muted,
  },
  totalValue: {
    fontSize: 14,
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
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.revenue,
  },
  payment: {
    marginTop: SPACING.md,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.pending,
    textAlign: 'center',
  },
  closeButton: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
