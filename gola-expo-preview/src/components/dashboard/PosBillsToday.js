import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, RADIUS, SPACING } from '../../theme';
import {
  computeTodayBillSummary,
  formatCurrency,
  formatIstTime,
  selectTodayBills,
} from '../../utils/dashboardMetrics';
import {
  billStatusLabel,
  billStatusStyle,
  derivePaymentStatus,
  paymentStatusLabel,
  paymentStatusStyle,
} from '../../utils/billUtils';
import { audienceLabel } from '../../utils/audienceBilling';

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'CUSTOMER', label: 'Customer' },
  { key: 'STAFF', label: 'Staff' },
];

function SummaryCell({ label, value, accent, hint }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={styles.summaryHint}>{hint}</Text>
    </View>
  );
}

export default function PosBillsToday({ bills, now }) {
  const [filter, setFilter] = useState('ALL');
  const todayBills = useMemo(() => selectTodayBills(bills, now), [bills, now]);
  const summary = useMemo(() => computeTodayBillSummary(todayBills, now), [todayBills, now]);

  const filteredBills = useMemo(
    function () {
      if (filter === 'ALL') {
        return todayBills;
      }
      return todayBills.filter(function (bill) {
        return String(bill.audience || 'CUSTOMER').trim().toUpperCase() === filter;
      });
    },
    [todayBills, filter],
  );

  function countFor(key) {
    if (key === 'ALL') {
      return todayBills.length;
    }
    return todayBills.filter(function (bill) {
      return String(bill.audience || 'CUSTOMER').trim().toUpperCase() === key;
    }).length;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Bills {'\u00b7'} Today</Text>
      <Text style={styles.subtitle}>
        POS and Orders/session bills created today, including unpaid bills
      </Text>

      <View style={styles.summaryGrid}>
        <SummaryCell label="Bills" value={String(summary.totalBills)} hint="All bills created today" />
        <SummaryCell
          label="Total"
          value={formatCurrency(summary.total)}
          accent={COLORS.text}
          hint="Total value of today's recognized bills"
        />
        <SummaryCell
          label="Staff Payments"
          value={formatCurrency(summary.staffPayments)}
          accent={COLORS.revenue}
          hint="Amount paid on today's staff bills"
        />
        <SummaryCell
          label="Customer Payments"
          value={formatCurrency(summary.customerPayments)}
          accent={summary.customerPayments > 0 ? COLORS.pending : COLORS.text}
          hint="Outstanding balance on today's customer bills"
        />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(function (entry) {
          const active = filter === entry.key;
          return (
            <Pressable
              key={entry.key}
              onPress={() => setFilter(entry.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {entry.label} ({countFor(entry.key)})
              </Text>
            </Pressable>
          );
        })}
      </View>

      {filteredBills.length === 0 ? (
        <Text style={styles.empty}>No bills match this filter yet.</Text>
      ) : (
        filteredBills.map(function (bill) {
          const status = billStatusStyle(bill.status);
          const payment = paymentStatusStyle(derivePaymentStatus(bill), bill);
          const lines = Array.isArray(bill.lines) ? bill.lines : [];
          return (
            <View key={String(bill._id || bill.billNumber)} style={styles.bill}>
              <View style={styles.billHeader}>
                <View style={styles.billHeaderMain}>
                  <Text style={styles.billNumber} numberOfLines={1}>
                    {bill.billNumber || 'Bill'}
                  </Text>
                  <Text style={styles.billMeta}>
                    {formatIstTime(bill.createdAt) || 'Today'} {'\u00b7'}{' '}
                    {String(bill.origin || 'SESSION').toUpperCase()} {'\u00b7'}{' '}
                    {audienceLabel(bill.audience) || 'Customer'}
                  </Text>
                </View>
                <Text style={styles.billTotal}>{formatCurrency(bill.totalAmount)}</Text>
              </View>

              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: status.bg, borderColor: status.border }]}>
                  <Text style={[styles.badgeText, { color: status.fg }]}>
                    {billStatusLabel(bill.status)}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: payment.bg, borderColor: payment.border }]}>
                  <Text style={[styles.badgeText, { color: payment.fg }]}>
                    {paymentStatusLabel(undefined, bill)}
                  </Text>
                </View>
              </View>

              {lines.length > 0 ? (
                <View style={styles.lines}>
                  {lines.map(function (line, index) {
                    return (
                      <View key={String(line.itemId || index)} style={styles.line}>
                        <Text style={styles.lineName} numberOfLines={1}>
                          {line.quantity} {'\u00d7'} {line.name}
                        </Text>
                        <Text style={styles.lineValue}>{formatCurrency(line.total)}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.moneyRow}>
                <Text style={styles.moneyText}>Paid {formatCurrency(bill.amountPaid)}</Text>
                <Text style={styles.moneyText}>Due {formatCurrency(bill.balanceDue)}</Text>
              </View>
            </View>
          );
        })
      )}
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
    marginTop: 2,
    fontSize: 12,
    color: COLORS.muted,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  summaryCell: {
    flexGrow: 1,
    flexBasis: 120,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    marginTop: SPACING.xs,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  summaryHint: {
    marginTop: SPACING.xs,
    fontSize: 10,
    color: COLORS.muted,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  filterChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
  },
  filterTextActive: {
    color: '#ffffff',
  },
  empty: {
    marginTop: SPACING.lg,
    fontSize: 13,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
  bill: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  billHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  billHeaderMain: {
    flex: 1,
    minWidth: 0,
  },
  billNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  billMeta: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.muted,
  },
  billTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  badge: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  lines: {
    marginTop: SPACING.sm,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingVertical: 2,
  },
  lineName: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text,
  },
  lineValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  moneyText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
});
