import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';
import {
  canCancelOrder,
  formatCurrency,
  formatDate,
  formatTime,
  getOrderActions,
  statusStyle,
} from '../../utils/orderUtils';
import StatusBadge from './StatusBadge';
import OrderItemRow from './OrderItemRow';
import {
  billStatusLabel,
  billStatusStyle,
  paymentStatusLabel,
  paymentStatusStyle,
} from '../../utils/billUtils';

function customerName(session) {
  const user = session && session.userId;
  if (user && typeof user.name === 'string' && user.name.trim()) {
    return user.name.trim();
  }
  return 'Guest';
}

function customerMobile(session) {
  const user = session && session.userId;
  if (user && user.mobile != null && String(user.mobile).trim() !== '') {
    return String(user.mobile);
  }
  return '';
}

function OrderBlock({ order, index, pending, onStatusAction, onCancelRequest }) {
  if (!order) {
    return null;
  }

  const actions = getOrderActions(order.status);
  const cancellable = canCancelOrder(order.status);
  const items = Array.isArray(order.items) ? order.items : [];
  const previewItems = items.slice(0, 3);
  const hiddenItems = items.length - previewItems.length;
  return (
    <View style={styles.orderBlock}>
      <View style={styles.orderTopRow}>
        <Text style={styles.orderId} numberOfLines={1}>
          {order.orderId || 'Order #' + (index + 1)}
        </Text>
        <Text style={styles.orderTime}>{formatTime(order.createdAt)}</Text>
        <View style={styles.spacer} />
        <StatusBadge status={order.status} size="sm" />
        <Text style={styles.orderAmount}>{formatCurrency(order.totalAmount)}</Text>
      </View>

      {previewItems.length > 0
        ? previewItems.map(function (item, itemIndex) {
            return <OrderItemRow key={'item-' + index + '-' + itemIndex} item={item} />;
          })
        : null}
      {items.length === 0 ? <Text style={styles.mutedLine}>No items recorded</Text> : null}
      {hiddenItems > 0 ? (
        <Text style={styles.moreItems}>
          {'+' + hiddenItems + ' more item' + (hiddenItems === 1 ? '' : 's')}
        </Text>
      ) : null}

      {order.previousOrderSnapshot ? (
        <Text style={styles.modified}>Order modified \u2014 re-acceptance required</Text>
      ) : null}

      {actions.length > 0 || cancellable ? (
        <View style={styles.actionRow}>
          {actions.map(function (action) {
            return (
              <Pressable
                key={action.key}
                disabled={pending}
                style={[styles.actionBtn, pending && styles.actionBtnDisabled]}
                onPress={() => onStatusAction(order, action.apiValue)}>
                <Text style={styles.actionBtnText}>{pending ? 'Working...' : action.label}</Text>
              </Pressable>
            );
          })}
          {cancellable ? (
            <Pressable
              disabled={pending}
              style={[styles.cancelBtn, pending && styles.actionBtnDisabled]}
              onPress={() => onCancelRequest(order)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.terminalText}>{terminalLabel(order.status)}</Text>
      )}
    </View>
  );
}

function terminalLabel(status) {
  if (status === 'CANCELLED' || status === 'Cancelled') {
    return 'Order cancelled';
  }
  if (status === 'COMPLETED' || status === 'Completed') {
    return 'Order completed';
  }
  return '';
}

function BillBadge({ label, palette }) {
  if (!label) {
    return null;
  }
  return (
    <View style={[styles.billBadge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.billBadgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export default function SessionOrderCard({
  session,
  pendingOrderIds,
  onStatusAction,
  onCancelRequest,
  onViewDetails,
  bill,
  onOpenBill,
}) {
  const [expanded, setExpanded] = React.useState(false);

  if (!session) {
    return null;
  }

  const orders = Array.isArray(session.orders) ? session.orders : [];
  const collapsed = !expanded && orders.length > 2;
  const visibleOrders = collapsed ? orders.slice(0, 2) : orders;
  const hiddenCount = orders.length - visibleOrders.length;
  const palette = statusStyle(session.status);

  return (
    <View style={[styles.card, { borderLeftColor: palette.fg, borderLeftWidth: 4 }]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{customerName(session).charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {customerName(session)}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {customerMobile(session) ? customerMobile(session) + '  \u2022  ' : ''}
            {formatTime(session.createdAt)} {'\u2022'} {formatDate(session.createdAt)}
          </Text>
        </View>
      </View>

      <View style={styles.tagRow}>
        {session.orderType ? <Text style={styles.tag}>{session.orderType}</Text> : null}
        {session.tableNumber ? <Text style={styles.tag}>{'Table ' + session.tableNumber}</Text> : null}
        {session.isDelivery ? <Text style={[styles.tag, styles.deliveryTag]}>Delivery</Text> : null}
        <Text style={styles.orderCount}>
          {orders.length} order{orders.length === 1 ? '' : 's'}
        </Text>
      </View>

      {session.isDelivery && session.deliveryAddress ? (
        <Text style={styles.address} numberOfLines={2}>
          {session.deliveryAddress}
        </Text>
      ) : null}

      <View style={styles.ordersWrap}>
        {visibleOrders.map(function (order, index) {
          return (
            <OrderBlock
              key={order && order._id ? String(order._id) : 'order-' + index}
              order={order}
              index={index}
              pending={Boolean(order && pendingOrderIds && pendingOrderIds[order._id])}
              onStatusAction={onStatusAction}
              onCancelRequest={onCancelRequest}
            />
          );
        })}
        {visibleOrders.length === 0 ? (
          <Text style={styles.noItems}>No orders in this session.</Text>
        ) : null}
      </View>

      {orders.length > 2 ? (
        <Pressable style={styles.expandBtn} onPress={() => setExpanded(!expanded)}>
          <Text style={styles.expandText}>
            {expanded ? 'Show less' : 'Show ' + hiddenCount + ' more'}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Session Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(session.totalAmount)}</Text>
        </View>
        <Pressable
          style={styles.billRow}
          onPress={() => onOpenBill && onOpenBill(session)}>
          <Text style={styles.billRowLabel} numberOfLines={1}>
            {bill ? (bill.billNumber || 'Bill') : 'No bill yet'}
          </Text>
          {bill ? (
            <View style={styles.billRowBadges}>
              <BillBadge label={billStatusLabel(bill.status)} palette={billStatusStyle(bill.status)} />
              <BillBadge
                label={paymentStatusLabel(bill.paymentStatus, bill)}
                palette={paymentStatusStyle(bill.paymentStatus, bill)}
              />
            </View>
          ) : (
            <Text style={styles.billRowAction}>Bill Now</Text>
          )}
        </Pressable>
        <Pressable style={styles.detailsBtn} onPress={() => onViewDetails && onViewDetails(session)}>
          <Text style={styles.detailsText}>View Session Details</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    backgroundColor: '#e2e8f0',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.accent,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  meta: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  tag: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    marginRight: SPACING.sm,
    marginTop: SPACING.xs,
  },
  deliveryTag: {
    color: '#b45309',
    backgroundColor: '#fef9c3',
  },
  orderCount: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: SPACING.xs,
  },
  address: {
    fontSize: 12,
    color: COLORS.muted,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  ordersWrap: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  orderBlock: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  orderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderId: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    maxWidth: 150,
  },
  orderTime: {
    fontSize: 11,
    color: COLORS.muted,
    marginLeft: SPACING.sm,
  },
  spacer: {
    flex: 1,
  },
  orderAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  moreItems: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: SPACING.sm,
  },
  mutedLine: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: SPACING.sm,
  },
  noItems: {
    fontSize: 12,
    color: COLORS.muted,
    padding: SPACING.lg,
  },
  modified: {
    fontSize: 12,
    color: '#a16207',
    backgroundColor: '#fef9c3',
    borderColor: '#fde047',
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.sm,
  },
  actionBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.sm,
    marginTop: SPACING.sm,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: COLORS.dangerBg,
    borderColor: COLORS.danger,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.sm,
    marginTop: SPACING.sm,
  },
  cancelText: {
    color: COLORS.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  terminalText: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: SPACING.sm,
  },
  expandBtn: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  expandText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  totalLabel: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  detailsBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },
  billRowLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    flexShrink: 1,
  },
  billRowAction: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.accent,
  },
  billRowBadges: {
    flexDirection: 'row',
    marginLeft: SPACING.sm,
  },
  billBadge: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    marginLeft: SPACING.xs,
  },
  billBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  detailsText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
