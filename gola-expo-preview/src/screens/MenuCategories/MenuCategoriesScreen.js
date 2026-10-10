import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import MenuManagement from './MenuManagement';
import CategoryManagement from './CategoryManagement';
import { getCategories, getItems } from '../../api/menuService';
import { getErrorMessage } from '../../utils/menuUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

const SECTIONS = [
  { key: 'menu', label: 'Menu Management' },
  { key: 'category', label: 'Category Management' },
];

// Menu & Categories is one drawer destination with two in-screen sections
// (no bottom tabs). It owns the shared items + categories data and reloads both
// after any mutation so item counts and pickers stay consistent.
export default function MenuCategoriesScreen() {
  const [section, setSection] = useState('menu');
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async function load(isRefresh) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const results = await Promise.all([getItems('staff'), getCategories()]);
      setItems(results[0]);
      setCategories(results[1]);
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load menu data'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(
      function () {
        load(hasLoadedRef.current);
        hasLoadedRef.current = true;
      },
      [load],
    ),
  );

  const onRefresh = useCallback(function () {
    load(true);
  }, [load]);

  const onRetry = useCallback(function () {
    load(false);
  }, [load]);

  const onChanged = useCallback(function () {
    load(true);
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.segment}>
        {SECTIONS.map(function (entry) {
          const active = section === entry.key;
          return (
            <Pressable
              key={entry.key}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
              onPress={() => setSection(entry.key)}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        {section === 'menu' ? (
          <MenuManagement
            items={items}
            categories={categories}
            loading={loading}
            error={error}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onRetry={onRetry}
            onChanged={onChanged}
          />
        ) : (
          <CategoryManagement
            categories={categories}
            items={items}
            loading={loading}
            error={error}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onRetry={onRetry}
            onChanged={onChanged}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  segment: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentItemActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.muted,
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  body: {
    flex: 1,
  },
});
