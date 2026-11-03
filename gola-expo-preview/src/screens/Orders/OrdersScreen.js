import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import SearchBar from '../../components/orders/SearchBar';
import FilterChips from '../../components/orders/FilterChips';
import SessionOrderCard from '../../components/orders/SessionOrderCard';
import SessionDetailsModal from '../../components/orders/SessionDetailsModal';
import BillModal from '../../components/orders/BillModal';
import { getGroupedOrders, updateOrderStatus } from '../../api/orderService';
import { subscribeToOrders } from '../../api/socketClient';
import { COLORS, RADIUS, SPACING } from '../../theme';
import {
  FILTER_OPTIONS,
  applyFilters,
  buildSession,
  filterSessionsByPeriod,
  formatCurrency,
  upsertSession,
} from '../../utils/orderUtils';

const LOCAL_UPDATE_WINDOW_MS = 2500;
const BANNER_TIMEOUT_MS = 6000;
const TWO_COLUMN_MIN_WIDTH = 720;
const DATE_PERIOD_OPTIONS = [
  { value: 'today', label: 'Today (1 Day)' },
  { value: 'month', label: '1 Month' },
  { value: 'year', label: '1 Year' },
];

function toSessions(data) {
  if (!Array.isArray(data)) {
    return [];
  }
  const sessions = [];
  data.forEach(function (session) {
    if (!session || typeof session !== 'object' || !session.sessionId) {
      return;
    }
    sessions.push(
      buildSession(session.sessionId, Array.isArray(session.orders) ? session.orders : []),
    );
  });
  return sessions.sort(function (a, b) {
    const aTime = a.createdAt ? a.createdAt.getTime() : 0;
    const bTime = b.createdAt ? b.createdAt.getTime() : 0;
    return bTime - aTime;
  });
}

function keyExtractor(item) {
  return item.sessionId;
}

export default function OrdersScreen() {
  const { width } = useWindowDimensions();
  const [sessions, setSessions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [datePeriod, setDatePeriod] = useState('today');
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [billBySession, setBillBySession] = useState({});
  const [billSession, setBillSession] = useState(null);
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [pendingOrderIds, setPendingOrderIds] = useState({});
  const [actionError, setActionError] = useState(null);
  const [banner, setBanner] = useState(null);

  const pendingRef = useRef({});
  const recentLocalUpdatesRef = useRef({});
  const lastEventKeyRef = useRef(null);
  const bannerTimerRef = useRef(null);

  const load = useCallback(async function load(isRefresh) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await getGroupedOrders();
      setSessions(toSessions(data));
    } catch (e) {
      setError((e && e.message) || 'Failed to load orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = useCallback(function () {
    load(true);
  }, [load]);

  const handleSessionUpdate = useCallback(function (payload) {
    if (!payload || !payload.sessionId) {
      return;
    }
    const expiry = recentLocalUpdatesRef.current[payload.sessionId] || 0;
    if (Date.now() < expiry) {
      return;
    }
    const session = buildSession(
      payload.sessionId,
      Array.isArray(payload.orders) ? payload.orders : [],
    );
    setSessions(function (prev) {
      return upsertSession(prev, session);
    });
  }, []);

  const handleNewOrder = useCallback(function (payload) {
    const rawKey = payload && (payload.orderId || payload.sessionId);
    const key = rawKey ? String(rawKey) : String(Date.now());
    if (lastEventKeyRef.current === key) {
      return;
    }
    lastEventKeyRef.current = key;
    setBanner({
      key: key,
      name: (payload && payload.customerName) || 'Guest',
      amount: (payload && payload.totalAmount) || 0,
      type: payload && payload.isDelivery ? 'Delivery' : (payload && payload.orderType) || 'Order',
    });
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
    }
    bannerTimerRef.current = setTimeout(function () {
      setBanner(null);
    }, BANNER_TIMEOUT_MS);
  }, []);

  useFocusEffect(
    useCallback(
      function () {
        load(false);
        return subscribeToOrders({
          onSessionUpdate: handleSessionUpdate,
          onNewOrder: handleNewOrder,
        });
      },
      [load, handleSessionUpdate, handleNewOrder],
    ),
  );

  useEffect(function () {
    return function () {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

  const handleStatusAction = useCallback(async function (order, apiValue) {
    if (!order || !order._id || !apiValue) {
      return;
    }
    if (pendingRef.current[order._id]) {
      return;
    }
    const sessionId = order.sessionId;
    if (sessionId) {
      recentLocalUpdatesRef.current[sessionId] = Date.now() + LOCAL_UPDATE_WINDOW_MS;
    }
    pendingRef.current[order._id] = true;
    setPendingOrderIds(function (prev) {
      const next = Object.assign({}, prev);
      next[order._id] = true;
      return next;
    });
    setActionError(null);
    try {
      const updated = await updateOrderStatus(order._id, apiValue);
      const session = buildSession(sessionId, Array.isArray(updated) ? updated : []);
      if (session.sessionId) {
        setSessions(function (prev) {
          return upsertSession(prev, session);
        });
      }
    } catch (e) {
      setActionError((e && e.message) || 'Failed to update order status.');
    } finally {
      delete pendingRef.current[order._id];
      setPendingOrderIds(function () {
        return Object.assign({}, pendingRef.current);
      });
    }
  }, []);

  const handleCancelRequest = useCallback(
    function (order) {
      Alert.alert('Cancel Order', 'Cancel this order? This cannot be undone.', [
        { text: 'Keep Order', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: function () {
            handleStatusAction(order, 'CANCELLED');
          },
        },
      ]);
    },
    [handleStatusAction],
  );

  const openDetails = useCallback(function (session) {
    setSelectedSession(session);
    setModalVisible(true);
  }, []);

  const applyBill = useCallback(function (sessionId, bill) {
    if (!sessionId) {
      return;
    }
    setBillBySession(function (prev) {
      if (prev[sessionId] === bill) {
        return prev;
      }
      const next = Object.assign({}, prev);
      next[sessionId] = bill;
      return next;
    });
  }, []);

  const openBillModal = useCallback(function (session) {
    if (!session || !session.sessionId) {
      return;
    }
    setBillSession(session);
    setBillModalVisible(true);
  }, []);

  const handleBillChange = useCallback(
    function (bill) {
      if (billSession) {
        applyBill(billSession.sessionId, bill);
      }
    },
    [billSession, applyBill],
  );

  const dateFilteredSessions = useMemo(
    function () {
      return filterSessionsByPeriod(sessions, datePeriod);
    },
    [sessions, datePeriod],
  );

  const filteredSessions = useMemo(
    function () {
      return applyFilters(dateFilteredSessions, { status: filter, query: query });
    },
    [dateFilteredSessions, filter, query],
  );

  const numColumns = width >= TWO_COLUMN_MIN_WIDTH ? 2 : 1;
  const showInitialLoading = loading && sessions === null;
  const showInitialError = !loading && sessions === null && Boolean(error);

  const renderItem = useCallback(
    function (info) {
      const session = info.item;
      return (
        <View style={styles.cardWrapper}>
          <SessionOrderCard
            session={session}
            pendingOrderIds={pendingOrderIds}
            onStatusAction={handleStatusAction}
            onCancelRequest={handleCancelRequest}
            onViewDetails={openDetails}
            bill={billBySession[session.sessionId]}
            onOpenBill={openBillModal}
          />
        </View>
      );
    },
    [pendingOrderIds, handleStatusAction, handleCancelRequest, openDetails, billBySession, openBillModal],
  );

  return (
    <View style={styles.screen}>
      {banner ? (
        <Pressable style={styles.banner} onPress={() => setBanner(null)}>
          <Text style={styles.bannerText} numberOfLines={1}>
            New order {'\u2022'} {banner.name} {'\u2022'} {formatCurrency(banner.amount)} {'\u2022'} {banner.type}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.headerArea}>
        <Text style={styles.title}>Orders Management</Text>
        <Text style={styles.subtitle}>Manage customer orders grouped by visit sessions.</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.datePeriodRow}>
          {DATE_PERIOD_OPTIONS.map(function (option) {
            const active = option.value === datePeriod;
            return (
              <Pressable
                key={option.value}
                onPress={() => setDatePeriod(option.value)}
                style={[styles.datePeriodChip, active && styles.datePeriodChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}>
                <Text style={[styles.datePeriodText, active && styles.datePeriodTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <SearchBar value={query} onChangeText={setQuery} />
        <FilterChips options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        {error && sessions !== null ? (
          <Pressable style={styles.actionError} onPress={onRefresh}>
            <Text style={styles.actionErrorText}>{'Refresh failed: ' + error + '  (tap to retry)'}</Text>
          </Pressable>
        ) : null}
        {actionError ? (
          <Pressable style={styles.actionError} onPress={() => setActionError(null)}>
            <Text style={styles.actionErrorText}>{actionError + '  (tap to dismiss)'}</Text>
          </Pressable>
        ) : null}
      </View>

      {showInitialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.centerText}>Loading orders...</Text>
        </View>
      ) : showInitialError ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Could not load orders</Text>
          <Text style={styles.centerText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => load(false)}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          key={'orders-' + numColumns}
          data={filteredSessions}
          numColumns={numColumns}
          keyExtractor={keyExtractor}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {dateFilteredSessions.length === 0
                  ? 'No orders found for this period'
                  : 'No orders found'}
              </Text>
              <Text style={styles.centerText}>
                {dateFilteredSessions.length === 0
                  ? 'Try another time period to see orders.'
                  : 'Try adjusting your filters or search query.'}
              </Text>
            </View>
          }
        />
      )}

      <SessionDetailsModal
        visible={modalVisible}
        session={selectedSession}
        bill={billBySession[selectedSession && selectedSession.sessionId]}
        onOpenBill={openBillModal}
        onClose={() => setModalVisible(false)}
      />
      {billSession ? (
        <BillModal
          key={billSession.sessionId}
          visible={billModalVisible}
          session={billSession}
          onClose={() => setBillModalVisible(false)}
          onChangeBill={handleBillChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  banner: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  bannerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  headerArea: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  datePeriodRow: {
    paddingBottom: SPACING.sm,
  },
  datePeriodChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: SPACING.sm,
  },
  datePeriodChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  datePeriodText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
  },
  datePeriodTextActive: {
    color: '#ffffff',
  },
  actionError: {
    backgroundColor: COLORS.dangerBg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.danger,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  actionErrorText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  columnWrapper: {
    gap: SPACING.md,
  },
  cardWrapper: {
    flex: 1,
    marginBottom: SPACING.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  centerText: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  retryBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl * 2,
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
});
