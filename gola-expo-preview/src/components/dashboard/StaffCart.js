import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { getBills, recordPayment } from '../../api/billService';
import { makeIdempotencyKey } from '../../utils/audienceBilling';
import { formatCurrency, getErrorMessage } from '../../utils/billUtils';
import { formatIstTime, istDateKey, istDayBounds } from '../../utils/dashboardMetrics';
import { COLORS, RADIUS, SPACING } from '../../theme';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIODS = [
  { key: 'TODAY', label: 'Today', days: 1 },
  { key: '7_DAYS', label: '7 Days', days: 7 },
  { key: '30_DAYS', label: '30 Days', days: 30 },
];

function getDateRange(period, referenceTime) {
  const now = Number.isFinite(referenceTime) ? new Date(referenceTime) : new Date();
  const { start } = istDayBounds(now);
  const selected = PERIODS.find((entry) => entry.key === period) || PERIODS[0];
  return {
    from: istDateKey(new Date(start.getTime() - (selected.days - 1) * DAY_MS)),
    to: istDateKey(now),
  };
}

function billDue(bill) {
  const due = Number(bill && bill.balanceDue);
  return Number.isFinite(due) ? Math.max(0, due) : 0;
}

export default function StaffCart({ onCheckoutComplete, refreshKey }) {
  const [period, setPeriod] = useState('TODAY');
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState(null);
  const paymentKeys = useRef(Object.create(null));

  const dateRange = useMemo(
    () => getDateRange(period, refreshKey),
    [period, refreshKey],
  );
  const outstandingTotal = useMemo(
    () =>
      bills.reduce(function (total, bill) {
        return bill && bill.status === 'OPEN' ? total + billDue(bill) : total;
      }, 0),
    [bills],
  );

  const loadBills = useCallback(async function loadBills(showLoading) {
    if (showLoading !== false) {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await getBills({
        origin: 'POS',
        audience: 'STAFF',
        from: dateRange.from,
        to: dateRange.to,
      });
      setBills(result);
      return true;
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Could not load the staff ledger.'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    let active = true;
    getBills({
      origin: 'POS',
      audience: 'STAFF',
      from: dateRange.from,
      to: dateRange.to,
    })
      .then((result) => {
        if (active) {
          setBills(result);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError, 'Could not load the staff ledger.'));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [dateRange]);

  const settleVisibleBills = useCallback(async function settleVisibleBills() {
    if (settling || outstandingTotal <= 0) {
      return;
    }
    setSettling(true);
    setError(null);
    const failures = [];

    try {
      for (const bill of bills) {
        const amount = bill && bill.status === 'OPEN' ? billDue(bill) : 0;
        if (!bill || !bill._id || amount <= 0) {
          continue;
        }

        const billId = String(bill._id);
        let attempt = paymentKeys.current[billId];
        if (!attempt || attempt.amount !== amount) {
          attempt = {
            amount,
            idempotencyKey: makeIdempotencyKey('staff-ledger-settle'),
          };
          paymentKeys.current[billId] = attempt;
        }
        try {
          await recordPayment(billId, {
            amount,
            method: 'OTHER',
            idempotencyKey: attempt.idempotencyKey,
          });
          delete paymentKeys.current[billId];
        } catch (paymentError) {
          failures.push(
            `${bill.billNumber || billId}: ${getErrorMessage(paymentError, 'payment failed')}`,
          );
        }
      }

      if (failures.length > 0) {
        setError(`Some bills could not be settled: ${failures.join('; ')}`);
      }
      await Promise.all([
        loadBills(false),
        typeof onCheckoutComplete === 'function' ? onCheckoutComplete() : Promise.resolve(),
      ]);
    } finally {
      setSettling(false);
    }
  }, [bills, loadBills, onCheckoutComplete, outstandingTotal, settling]);

  const confirmSettleVisibleBills = useCallback(() => {
    Alert.alert(
      'Settle staff bills?',
      `Record ${formatCurrency(outstandingTotal)} in payments for the visible outstanding bills using OTHER?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settle', onPress: settleVisibleBills },
      ],
    );
  }, [outstandingTotal, settleVisibleBills]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Staff Ledger</Text>
      <Text style={styles.note}>Need to add staff details? Please upgrade.</Text>

      <View style={styles.filterRow}>
        {PERIODS.map((entry) => {
          const active = period === entry.key;
          return (
            <Pressable
              key={entry.key}
              onPress={() => {
                if (period !== entry.key) {
                  setLoading(true);
                  setError(null);
                  setPeriod(entry.key);
                }
              }}
              style={[styles.filterButton, active && styles.filterButtonActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.subtitle}>
        Staff POS bills · {dateRange.from === dateRange.to ? dateRange.to : `${dateRange.from} – ${dateRange.to}`}
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.loading} color={COLORS.accent} />
      ) : bills.length === 0 ? (
        <Text style={styles.emptyText}>No staff bills in this period.</Text>
      ) : (
        bills.map((bill) => {
          const lines = Array.isArray(bill.lines) ? bill.lines : [];
          return (
            <View key={String(bill._id || bill.billNumber)} style={styles.bill}>
              <View style={styles.billHeader}>
                <View style={styles.billDetails}>
                  <Text style={styles.billNumber}>{bill.billNumber || 'Staff bill'}</Text>
                  <Text style={styles.billTime}>{formatIstTime(bill.createdAt) || 'Time unavailable'}</Text>
                </View>
                <Text style={styles.billTotal}>{formatCurrency(bill.totalAmount)}</Text>
              </View>
              {lines.map((line, index) => (
                <View key={String(line.itemId || index)} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {line.quantity} × {line.name || 'Item'}
                  </Text>
                  <Text style={styles.itemTotal}>{formatCurrency(line.total)}</Text>
                </View>
              ))}
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>
                  {bill.status === 'SETTLED' ? 'Settled' : 'Outstanding'}
                </Text>
                <Text style={styles.balanceValue}>
                  {formatCurrency(bill.status === 'SETTLED' ? 0 : billDue(bill))}
                </Text>
              </View>
            </View>
          );
        })
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable
        style={[styles.settleButton, (outstandingTotal <= 0 || settling) && styles.disabledButton]}
        onPress={confirmSettleVisibleBills}
        disabled={outstandingTotal <= 0 || settling}
        accessibilityRole="button">
        {settling ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.settleText}>
            Settle Visible Bills · {formatCurrency(outstandingTotal)}
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
  },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  note: { marginTop: SPACING.xs, color: COLORS.muted, fontSize: 12 },
  subtitle: { marginTop: SPACING.md, color: COLORS.muted, fontSize: 11 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  filterButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  filterButtonActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#ffffff' },
  loading: { marginVertical: SPACING.lg },
  emptyText: { marginTop: SPACING.md, color: COLORS.muted, fontSize: 13 },
  bill: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
  },
  billHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  billDetails: { flex: 1, marginRight: SPACING.sm },
  billNumber: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  billTime: { marginTop: 2, color: COLORS.muted, fontSize: 11 },
  billTotal: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.sm },
  itemName: { flex: 1, marginRight: SPACING.sm, color: COLORS.text, fontSize: 12 },
  itemTotal: { color: COLORS.text, fontSize: 12 },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  balanceLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  balanceValue: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  errorText: { marginTop: SPACING.md, color: COLORS.danger, fontSize: 12 },
  settleButton: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    alignItems: 'center',
  },
  settleText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  disabledButton: { opacity: 0.5 },
});
