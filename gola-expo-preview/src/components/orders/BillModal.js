import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';
import { formatTime } from '../../utils/orderUtils';
import {
  PAYMENT_METHODS,
  billingErrorMessage,
  billStatusLabel,
  billStatusStyle,
  canAcceptPayment,
  canReversePayment,
  canVoidBill,
  countBillableOrders,
  formatCurrency,
  paymentMethodLabel,
  paymentStatusLabel,
  paymentStatusStyle,
  pickPrimaryBill,
  validatePaymentAmount,
} from '../../utils/billUtils';
import {
  generateSessionBill,
  getSessionBills,
  recordPayment as recordPaymentApi,
  resumeBill as resumeBillApi,
  reversePayment as reversePaymentApi,
  voidBill as voidBillApi,
} from '../../api/billService';

function chip(palette, label) {
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.chipText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

function PaymentRow({ payment, bill, onReverse }) {
  if (!payment) {
    return null;
  }
  const reversible = canReversePayment(payment, bill);
  return (
    <View style={styles.paymentRow}>
      <View style={styles.paymentRowText}>
        <Text style={styles.paymentMethod}>
          {paymentMethodLabel(payment.method)} {'\u2022'} {formatCurrency(payment.amount)}
        </Text>
        <Text style={styles.paymentNote} numberOfLines={1}>
          {formatTime(payment.receivedAt) + (payment.reference ? '  \u2022  ' + payment.reference : '')}
        </Text>
      </View>
      <Text style={styles.paymentState}>{paymentStatusForRow(payment)}</Text>
      {reversible ? (
        <Pressable style={styles.reverseBtn} onPress={() => onReverse(payment)}>
          <Text style={styles.reverseText}>Reverse</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function paymentStatusForRow(payment) {
  if (payment.status === 'RECORDED') {
    return 'Recorded';
  }
  if (payment.status === 'REVERSING') {
    return 'Reversing\u2026';
  }
  if (payment.status === 'REVERSED') {
    return 'Reversed';
  }
  return payment.status || 'Unknown';
}

export default function BillModal({ visible, session, onClose, onChangeBill }) {
  const sessionId = session && session.sessionId;
  // Remounted per session (key in OrdersScreen), so loading starts true and the
  // fetch below only flips it from its own async callbacks.
  const [loading, setLoading] = useState(true);
  const [bill, setBill] = useState(null);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reversingId, setReversingId] = useState(null);
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);

  const handleBillChange = useCallback(
    function (next) {
      setBill(next);
      setError(null);
      if (canAcceptPayment(next)) {
        setAmountText(String(next.balanceDue));
      } else {
        setAmountText('');
      }
      if (onChangeBill) {
        onChangeBill(next);
      }
    },
    [onChangeBill],
  );

  useEffect(
    function () {
      if (!visible || !sessionId) {
        return;
      }
      let cancelled = false;
      getSessionBills(sessionId)
        .then(function (bills) {
          if (cancelled) {
            return;
          }
          handleBillChange(pickPrimaryBill(bills));
        })
        .catch(function (e) {
          if (!cancelled) {
            setError(billingErrorMessage(e, 'Could not load bills for this session.'));
          }
        })
        .finally(function () {
          if (!cancelled) {
            setLoading(false);
          }
        });
      return function () {
        cancelled = true;
      };
    },
    [visible, sessionId, handleBillChange],
  );

  const handleGenerate = useCallback(
    async function () {
      if (!sessionId || generating) {
        return;
      }
      setGenerating(true);
      setError(null);
      try {
        const next = await generateSessionBill(sessionId);
        handleBillChange(next);
      } catch (e) {
        const data = e && e.data;
        const bills = data && data.bills;
        if (Array.isArray(bills) && bills.length > 0) {
          handleBillChange(pickPrimaryBill(bills));
        }
        setError(billingErrorMessage(e, 'Could not generate the bill.'));
      } finally {
        setGenerating(false);
      }
    },
    [sessionId, generating, handleBillChange],
  );

  const handlePay = useCallback(
    async function () {
      if (!bill || paying) {
        return;
      }
      const balance = bill.balanceDue;
      const check = validatePaymentAmount(Number(amountText), balance);
      if (!check.ok) {
        setError(check.message);
        return;
      }
      setPaying(true);
      setError(null);
      try {
        const response = await recordPaymentApi(bill._id, { amount: check.amount, method });
        const next = response && response.bill ? response.bill : response;
        handleBillChange(next);
      } catch (e) {
        setError(billingErrorMessage(e, 'Could not record the payment.'));
      } finally {
        setPaying(false);
      }
    },
    [bill, method, amountText, paying, handleBillChange],
  );

  const handleReverse = useCallback(
    async function (payment) {
      if (!bill || !payment || reversingId) {
        return;
      }
      setReversingId(payment.paymentId);
      setError(null);
      try {
        const next = await reversePaymentApi(bill._id, payment.paymentId);
        handleBillChange(next);
      } catch (e) {
        setError(billingErrorMessage(e, 'Could not reverse the payment.'));
      } finally {
        setReversingId(null);
      }
    },
    [bill, reversingId, handleBillChange],
  );

  const confirmReverse = useCallback(
    function (payment) {
      Alert.alert(
        'Reverse Payment',
        'Reverse this payment and restore it to the balance due?',
        [
          { text: 'Keep Payment', style: 'cancel' },
          { text: 'Reverse', style: 'destructive', onPress: function () { handleReverse(payment); } },
        ],
      );
    },
    [handleReverse],
  );

  const handleVoid = useCallback(
    async function () {
      if (!bill || voiding) {
        return;
      }
      setVoiding(true);
      setError(null);
      try {
        const next = await voidBillApi(bill._id);
        handleBillChange(next);
      } catch (e) {
        setError(billingErrorMessage(e, 'Could not void the bill.'));
      } finally {
        setVoiding(false);
      }
    },
    [bill, voiding, handleBillChange],
  );

  const confirmVoid = useCallback(
    function () {
      Alert.alert(
        'Void Bill',
        'Void this bill? All recorded payments will be reversed and the balance reset.',
        [
          { text: 'Keep Bill', style: 'cancel' },
          { text: 'Void Bill', style: 'destructive', onPress: function () { handleVoid(); } },
        ],
      );
    },
    [handleVoid],
  );

  const handleResume = useCallback(
    async function () {
      if (!bill) {
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const next = await resumeBillApi(bill._id);
        handleBillChange(next);
      } catch (e) {
        setError(billingErrorMessage(e, 'Could not resume the bill.'));
      } finally {
        setLoading(false);
      }
    },
    [bill, handleBillChange],
  );

  const billableCount = countBillableOrders(session && session.orders);
  const billStyle = bill && billStatusStyle(bill.status);
  const payStyle = bill && paymentStatusStyle(bill.paymentStatus, bill);
  const payments = bill && Array.isArray(bill.payments) ? bill.payments : [];
  const openForPayment = bill && canAcceptPayment(bill);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                Billing
              </Text>
              {sessionId ? (
                <Text style={styles.sheetSubtitle} numberOfLines={1}>
                  {sessionId}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Text style={styles.closeText}>{'\u2715'}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {loading && !bill ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={styles.mutedText}>Loading bills...</Text>
              </View>
            ) : !bill ? (
              <View style={styles.stack}>
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>No bill yet for this session</Text>
                  <Text style={styles.mutedText}>
                    Billing captures every current order ({billableCount} eligible) into a bill that
                    blocks cancel/change and tracks payments.
                  </Text>
                </View>
                <Pressable
                  disabled={generating || billableCount === 0}
                  style={[
                    styles.primaryBtn,
                    (generating || billableCount === 0) && styles.btnDisabled,
                  ]}
                  onPress={handleGenerate}>
                  <Text style={styles.primaryText}>
                    {generating
                      ? 'Generating...'
                      : billableCount === 0
                        ? 'No orders to bill'
                        : 'Generate Bill'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.stack}>
                <View style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.billNumber}>{bill.billNumber || 'Bill'}</Text>
                    <View style={styles.chipRow}>
                      {chip(billStyle, billStatusLabel(bill.status))}
                      {chip(payStyle, paymentStatusLabel(bill.paymentStatus, bill))}
                    </View>
                  </View>
                  {bill.voidReason ? (
                    <Text style={styles.voidReason}>{'Void reason: ' + bill.voidReason}</Text>
                  ) : null}
                  <View style={styles.totalLines}>
                    <View style={styles.totalLine}>
                      <Text style={styles.totalLineLabel}>Total</Text>
                      <Text style={styles.totalLineValue}>{formatCurrency(bill.totalAmount)}</Text>
                    </View>
                    <View style={styles.totalLine}>
                      <Text style={styles.totalLineLabel}>Paid</Text>
                      <Text style={styles.totalLineValue}>{formatCurrency(bill.amountPaid)}</Text>
                    </View>
                    <View style={[styles.totalLine, styles.grandLine]}>
                      <Text style={styles.grandLabel}>Balance Due</Text>
                      <Text style={styles.grandValue}>{formatCurrency(bill.balanceDue)}</Text>
                    </View>
                  </View>
                </View>

                {payments.length > 0 ? (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Payments ({payments.length})</Text>
                    {payments.map(function (payment) {
                      return (
                        <PaymentRow
                          key={payment.paymentId}
                          payment={payment}
                          bill={bill}
                          onReverse={confirmReverse}
                        />
                      );
                    })}
                  </View>
                ) : null}

                {openForPayment ? (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Record Payment</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={amountText}
                      onChangeText={setAmountText}
                      keyboardType="decimal-pad"
                      placeholder="Amount"
                      placeholderTextColor={COLORS.muted}
                    />
                    <View style={styles.methodRow}>
                      {PAYMENT_METHODS.map(function (candidate) {
                        const selected = candidate === method;
                        return (
                          <Pressable
                            key={candidate}
                            style={[styles.methodChip, selected && styles.methodChipActive]}
                            onPress={() => setMethod(candidate)}>
                            <Text
                              style={[
                                styles.methodChipText,
                                selected && styles.methodChipTextActive,
                              ]}>
                              {paymentMethodLabel(candidate)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Pressable
                      disabled={paying}
                      style={[styles.primaryBtn, paying && styles.btnDisabled]}
                      onPress={handlePay}>
                      <Text style={styles.primaryText}>{paying ? 'Recording...' : 'Record Payment'}</Text>
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.actionRow}>
                  {bill.status === 'VOIDING' ? (
                    <Pressable
                      disabled={loading}
                      style={[styles.secondaryBtn, loading && styles.btnDisabled]}
                      onPress={handleResume}>
                      <Text style={styles.secondaryText}>Resume Bill</Text>
                    </Pressable>
                  ) : null}
                  {canVoidBill(bill) ? (
                    <Pressable
                      disabled={voiding || paying}
                      style={[styles.voidBtn, (voiding || paying) && styles.btnDisabled]}
                      onPress={confirmVoid}>
                      <Text style={styles.voidText}>{voiding ? 'Voiding...' : 'Void Bill'}</Text>
                    </Pressable>
                  ) : null}
                </View>

                {payments.length > 0 && bill.status === 'OPEN' ? (
                  <Text style={styles.hint}>
                    Reverse a payment to restore it to the balance due. Voiding resets the whole bill.
                  </Text>
                ) : null}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetHeaderText: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  sheetSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  closeBtn: {
    paddingLeft: SPACING.md,
  },
  closeText: {
    fontSize: 18,
    color: COLORS.muted,
    fontWeight: '700',
  },
  sheetBody: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  stack: {
    gap: SPACING.md,
  },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.danger,
    padding: SPACING.md,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl * 2,
  },
  mutedText: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: SPACING.sm,
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  billNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    flexShrink: 1,
  },
  chipRow: {
    flexDirection: 'row',
    marginLeft: SPACING.sm,
  },
  chip: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    marginLeft: SPACING.xs,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  voidReason: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: SPACING.sm,
  },
  totalLines: {
    marginTop: SPACING.md,
  },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  totalLineLabel: {
    fontSize: 13,
    color: COLORS.muted,
  },
  totalLineValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  grandLine: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
    marginBottom: 0,
  },
  grandLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  grandValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  paymentRowText: {
    flex: 1,
  },
  paymentMethod: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  paymentNote: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  paymentState: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    marginLeft: SPACING.sm,
  },
  reverseBtn: {
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    marginLeft: SPACING.sm,
  },
  reverseText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  amountInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.md,
  },
  methodChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.sm,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  methodChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  methodChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  methodChipTextActive: {
    color: '#ffffff',
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    flex: 1,
  },
  secondaryText: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  voidBtn: {
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    flex: 1,
  },
  voidText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  hint: {
    fontSize: 12,
    color: COLORS.muted,
  },
});