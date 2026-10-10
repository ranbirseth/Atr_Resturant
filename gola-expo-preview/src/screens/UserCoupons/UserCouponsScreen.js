import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import UsersTab from './UsersTab';
import CouponsTab from './CouponsTab';
import { COLORS, RADIUS, SPACING } from '../../theme';

const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'coupons', label: 'Coupons' },
];

// Users & Coupons is one drawer destination with a branded header and two
// in-screen tabs (no bottom tabs). Each tab owns its own data lifecycle.
export default function UserCouponsScreen() {
  const [tab, setTab] = useState('users');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Gola Restaurant</Text>
        <Text style={styles.headerSubtitle}>Users & Coupons</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map(function (entry) {
          const active = tab === entry.key;
          return (
            <Pressable
              key={entry.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(entry.key)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        {tab === 'users' ? <UsersTab /> : <CouponsTab />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  headerSubtitle: {
    marginTop: SPACING.xs,
    fontSize: 13,
    color: COLORS.muted,
  },
  tabs: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.muted,
  },
  tabTextActive: {
    color: '#ffffff',
  },
  body: {
    flex: 1,
  },
});
