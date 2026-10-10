import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';
import StatusBadge from './StatusBadge';
import OrderItemRow from './OrderItemRow';
import { computeSessionTotals, formatCurrency, formatTime } from '../../utils/orderUtils';

function OrderDetail({ order, index }) {
  if (!order) {
    return null;
  }

  return (
    <View style={styles.orderBlock}>
      <View style={styles.orderTopRow}>
        <Text style={styles.orderId} numberOfLines={1}>
          {order.orderId || 'Order #' + (index + 1)}
        </Text>
        <View style={styles.spacer} />
        <StatusBadge status={order.status} size="sm" />
      </View>
      <Text style={styles.orderTime}>{formatTime(order.createdAt)}</Text>

      {order.items && order.items.length > 0 ? (
        order.items.map(function (item, itemIndex) {
          return <OrderItemRow key={'item-' + index + '-' + itemIndex} item={item} />;
        })
      ) : (
        <Text style={styles.muted}>No items recorded</Text>
      )}

      <View style={styles.orderTotalRow}>
        <Text style={styles.orderTotalLabel}>Order total</Text>
        <Text style={styles.orderTotalValue}>{formatCurrency(order.totalAmount)}</Text>
      </View>
    </View>
  );
}

export default function SessionDetailsModal({ visible, session, onClose }) {
  const orders = session && Array.isArray(session.orders) ? session.orders : [];
  const totals = computeSessionTotals(orders);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              Session Details
            </Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Text style={styles.closeText}>{'\u2715'}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody}>
            {session ? (
              <>
                <View style={styles.customerBox}>
                  <Text style={styles.customerName}>{sessionName(session)}</Text>
                  <Text style={styles.customerMeta}>{sessionMobile(session)}</Text>
                  <Text style={styles.customerMeta}>
                    {(session.isDelivery ? 'Home Delivery' : session.orderType || 'Order') +
                      (session.tableNumber ? ' \u2022 Table ' + session.tableNumber : '')}
                  </Text>
                  {session.deliveryAddress ? (
                    <Text style={styles.customerMeta}>{session.deliveryAddress}</Text>
                  ) : null}
                  <Text style={styles.sessionId} numberOfLines={1}>
                    {session.sessionId}
                  </Text>
                </View>

                <Text style={styles.sectionTitle}>All Orders ({orders.length})</Text>
                {orders.map(function (order, index) {
                  return (
                    <OrderDetail
                      key={order && order._id ? String(order._id) : 'od-' + index}
                      order={order}
                      index={index}
                    />
                  );
                })}

                <View style={styles.totalsBox}>
                  <View style={styles.totalLine}>
                    <Text style={styles.totalLineLabel}>Subtotal</Text>
                    <Text style={styles.totalLineValue}>{formatCurrency(totals.grossTotal)}</Text>
                  </View>
                  {totals.discountAmount > 0 ? (
                    <View style={styles.totalLine}>
                      <Text style={styles.totalLineLabel}>Discount</Text>
                      <Text style={styles.totalLineValue}>{'-' + formatCurrency(totals.discountAmount)}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.totalLine, styles.grandLine]}>
                    <Text style={styles.grandLabel}>Session Total</Text>
                    <Text style={styles.grandValue}>{formatCurrency(totals.totalAmount)}</Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.customerMeta}>No session selected.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function sessionName(session) {
  const user = session && session.userId;
  if (user && typeof user.name === 'string' && user.name.trim()) {
    return user.name.trim();
  }
  return 'Guest';
}

function sessionMobile(session) {
  const user = session && session.userId;
  if (user && user.mobile) {
    return String(user.mobile);
  }
  return 'No mobile';
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
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
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
  customerBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  customerName: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  customerMeta: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: SPACING.xs,
  },
  sessionId: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  orderBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  orderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spacer: {
    flex: 1,
  },
  orderId: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    flexShrink: 1,
  },
  orderTime: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: SPACING.xs,
  },
  muted: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: SPACING.sm,
  },
  orderTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  orderTotalLabel: {
    fontSize: 13,
    color: COLORS.muted,
  },
  orderTotalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  totalsBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
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
});
