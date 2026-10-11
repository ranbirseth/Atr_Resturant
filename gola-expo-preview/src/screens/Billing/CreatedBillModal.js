import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACING } from '../../theme';
import { formatCurrency } from '../../utils/billingUtils';
import { audienceLabel } from '../../utils/audienceBilling';

function stamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Confirmation for a POS bill that was created on the server (origin POS). All
// amounts come from the server DTO, not from the tablet's preview.
export default function CreatedBillModal({ bill, onClose }) {
  if (!bill) {
    return null;
  }
  const lines = Array.isArray(bill.lines) ? bill.lines : [];
  const label = audienceLabel(bill.audience) || 'Customer';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.brand}>Gola Restaurant</Text>
            <Text style={styles.title}>Bill Created</Text>
            <Text style={styles.stamp}>{stamp(bill.createdAt)}</Text>

            <View style={styles.success}>
              <Text style={styles.successTitle}>Saved on the server</Text>
              <Text style={styles.successText}>
                {bill.billNumber ? bill.billNumber + ' \u00b7 ' : ''}
                {label} pricing {'\u00b7'} this bill is stored and blocks changes to its source.
              </Text>
            </View>

            {lines.length > 0 ? (
              <View style={styles.lines}>
                {lines.map(function (line, index) {
                  return (
                    <View key={line.itemId || index} style={styles.line}>
                      <Text style={styles.lineName} numberOfLines={2}>
                        {line.quantity} {'\u00d7'} {line.name}
                      </Text>
                      <Text style={styles.lineValue}>{formatCurrency(line.total)}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.totals}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{formatCurrency(bill.subtotal)}</Text>
              </View>
              {bill.discount > 0 ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    Discount{bill.couponCode ? ' (' + bill.couponCode + ')' : ''}
                  </Text>
                  <Text style={styles.totalValue}>{'-' + formatCurrency(bill.discount)}</Text>
                </View>
              ) : null}
              <View style={[styles.totalRow, styles.grandRow]}>
                <Text style={styles.grandLabel}>Total</Text>
                <Text style={styles.grandValue}>{formatCurrency(bill.totalAmount)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Paid</Text>
                <Text style={styles.totalValue}>{formatCurrency(bill.amountPaid)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Balance Due</Text>
                <Text style={styles.totalValue}>{formatCurrency(bill.balanceDue)}</Text>
              </View>
            </View>

            <Text style={styles.note}>
              Amounts are authoritative from the server. Payments are recorded from the
              Sessions billing flow.
            </Text>
          </ScrollView>

          <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button">
            <Text style={styles.closeButtonText}>New Bill</Text>
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
  success: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.revenue,
    backgroundColor: COLORS.background,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.revenue,
  },
  successText: {
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
  note: {
    marginTop: SPACING.md,
    fontSize: 12,
    color: COLORS.muted,
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
