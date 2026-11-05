import React, { useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PRINTER_ENABLED } from '../../config/features';
import thermalPrinterService from '../../services/thermalPrinterService';
import { COLORS, RADIUS, SPACING } from '../../theme';
import { formatCurrency } from '../../utils/billingUtils';
import { audienceLabel } from '../../utils/audienceBilling';

const paymentQr = require('../../../assets/payment-qr.png');

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
  const insets = useSafeAreaInsets();
  const [printing, setPrinting] = useState(false);
  if (!bill) {
    return null;
  }
  const lines = Array.isArray(bill.lines) ? bill.lines : [];
  const label = audienceLabel(bill.audience) || 'Customer';

  async function handlePrint() {
    if (!PRINTER_ENABLED || printing) {
      return;
    }
    setPrinting(true);
    try {
      const printed = await thermalPrinterService.printReceipt(bill);
      if (!printed) {
        Alert.alert('Print failed, retry?', 'Check that the printer is on and connected.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: handlePrint },
        ]);
      }
    } catch (error) {
      console.error('Could not print the created bill:', error);
      Alert.alert('Print failed, retry?', 'Check that the printer is on and connected.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retry', onPress: handlePrint },
      ]);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.backdrop,
          { paddingTop: SPACING.lg + insets.top, paddingBottom: SPACING.lg + insets.bottom },
        ]}>
        <View style={styles.sheet}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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

            <View style={styles.paymentQr}>
              <Text style={styles.paymentQrLabel}>Scan to Pay</Text>
              <Image
                source={paymentQr}
                style={styles.paymentQrImage}
                resizeMode="contain"
                accessibilityLabel="Payment QR code"
              />
            </View>

            <Text style={styles.note}>
              Amounts are authoritative from the server. Payments are recorded from the
              Sessions billing flow.
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            {PRINTER_ENABLED ? (
              <Pressable
                style={[styles.printButton, printing && styles.disabledButton]}
                onPress={handlePrint}
                disabled={printing}
                accessibilityRole="button">
                <Text style={styles.printButtonText}>{printing ? 'Printing…' : 'Print Bill'}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button">
              <Text style={styles.closeButtonText}>New Bill</Text>
            </Pressable>
          </View>
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
  scroll: {
    flexShrink: 1,
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
  paymentQr: {
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  paymentQrLabel: {
    marginBottom: SPACING.sm,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  paymentQrImage: {
    width: 150,
    height: 150,
  },
  note: {
    marginTop: SPACING.md,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
  },
  actions: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  printButton: {
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  printButtonText: {
    color: COLORS.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  closeButton: {
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  disabledButton: {
    opacity: 0.6,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
