import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import StateView from '../../components/menu/StateView';
import { getUsers } from '../../api/userCouponService';
import {
  filterUsers,
  formatDate,
  getErrorMessage,
  userInitials,
} from '../../utils/userCouponUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

// Users tab: read-only listing of registered customers from GET /api/auth/all.
// Only fields the endpoint actually returns are shown; never secrets.
export default function UsersTab() {
  const { width } = useWindowDimensions();
  const [users, setUsers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async function load(isRefresh) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await getUsers();
      setUsers(data);
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load users'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(
      function () {
        load(false);
      },
      [load],
    ),
  );

  const onRefresh = useCallback(
    function () {
      load(true);
    },
    [load],
  );

  const onRetry = useCallback(
    function () {
      load(false);
    },
    [load],
  );

  const filtered = useMemo(
    function () {
      return filterUsers(users || [], query);
    },
    [users, query],
  );

  const columns = width >= 1000 ? 3 : width >= 680 ? 2 : 1;

  function renderCard({ item }) {
    const phone = item.phone && String(item.phone).trim() ? String(item.phone) : 'N/A';
    const email = item.email && item.email !== 'N/A' ? item.email : null;
    const orders = Number.isFinite(Number(item.orders)) ? Number(item.orders) : 0;
    const active = item.status === 'Active';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{userInitials(item.name)}</Text>
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {item.name || 'Unknown User'}
          </Text>
          <View style={[styles.badge, active ? styles.badgeActive : styles.badgeMuted]}>
            <Text style={[styles.badgeText, active ? styles.badgeTextActive : styles.badgeTextMuted]}>
              {item.status || 'Active'}
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone</Text>
          <Text style={styles.infoValue}>{phone}</Text>
        </View>
        {email ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{email}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Joined</Text>
          <Text style={styles.infoValue}>{formatDate(item.joined)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Orders</Text>
          <Text style={styles.infoValue}>{orders}</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return <StateView mode="loading" message="Loading users…" />;
  }
  if (error) {
    return <StateView mode="error" message={error} onRetry={onRetry} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        key={columns}
        data={filtered}
        keyExtractor={(item) => String(item.id || item._id || item.phone)}
        numColumns={columns}
        renderItem={renderCard}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name, email or phone…"
              placeholderTextColor={COLORS.muted}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            <Text style={styles.count}>
              {filtered.length} of {Array.isArray(users) ? users.length : 0} users
            </Text>
          </View>
        }
        ListEmptyComponent={
          <StateView
            mode="empty"
            message={query ? 'No users match your search.' : 'No users registered yet.'}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  columns: {
    gap: SPACING.lg,
  },
  search: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  count: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.accent,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  badge: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  badgeActive: { backgroundColor: '#e7f6ec' },
  badgeMuted: { backgroundColor: COLORS.background },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextActive: { color: COLORS.revenue },
  badgeTextMuted: { color: COLORS.muted },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
});
