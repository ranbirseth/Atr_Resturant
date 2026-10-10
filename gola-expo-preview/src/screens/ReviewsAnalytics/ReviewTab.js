import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import StateView from '../../components/menu/StateView';
import { getFeedbacks } from '../../api/reviewsService';
import {
  computeRatingStats,
  formatRating,
  reviewAuthor,
  reviewMessage,
  reviewOrderLabel,
  reviewTags,
} from '../../utils/analyticsUtils';
import { getErrorMessage } from '../../utils/menuUtils';
import { formatDate } from '../../utils/orderUtils';
import { COLORS, RADIUS, SPACING } from '../../theme';

function starString(rating) {
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return '\u2605'.repeat(value) + '\u2606'.repeat(5 - value);
}

// Review tab: customer feedback from GET /api/feedback (read-only).
export default function ReviewTab() {
  const { width } = useWindowDimensions();
  const [feedbacks, setFeedbacks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async function load(isRefresh) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await getFeedbacks();
      setFeedbacks(data);
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load reviews'));
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

  const safe = useMemo(
    () => (Array.isArray(feedbacks) ? feedbacks : []),
    [feedbacks],
  );
  const hasData = Array.isArray(feedbacks);
  const initialLoading = loading && !hasData;
  const showFullError = !!error && !hasData;

  const stats = useMemo(() => computeRatingStats(safe), [safe]);
  const maxBucket = stats.distribution.reduce(function (max, entry) {
    return Math.max(max, entry.count);
  }, 0);

  const columns = width >= 1000 ? 3 : width >= 680 ? 2 : 1;

  function renderReview({ item }) {
    const message = reviewMessage(item);
    const tags = reviewTags(item);
    const orderLabel = reviewOrderLabel(item);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.author} numberOfLines={1}>
            {reviewAuthor(item)}
          </Text>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        </View>

        <Text style={styles.stars}>{starString(item.rating)}</Text>

        {message ? (
          <Text style={styles.message}>{'\u201C' + message + '\u201D'}</Text>
        ) : (
          <Text style={styles.noMessage}>No message provided</Text>
        )}

        {tags.length > 0 ? (
          <View style={styles.tagRow}>
            {tags.map(function (tag) {
              return (
                <Text key={tag} style={styles.tag}>
                  {tag}
                </Text>
              );
            })}
          </View>
        ) : null}

        {orderLabel ? <Text style={styles.orderLabel}>{orderLabel}</Text> : null}
      </View>
    );
  }

  if (initialLoading) {
    return <StateView mode="loading" message="Loading reviews…" />;
  }
  if (showFullError) {
    return <StateView mode="error" message={error} onRetry={onRetry} />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        key={columns}
        data={safe}
        keyExtractor={(item) => String(item._id || item.createdAt)}
        numColumns={columns}
        renderItem={renderReview}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText} numberOfLines={2}>
                  Couldn&apos;t refresh: {error}
                </Text>
                <Pressable style={styles.errorBannerButton} onPress={onRefresh}>
                  <Text style={styles.errorBannerButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.summary}>
              <View style={styles.summaryLeft}>
                <Text style={styles.summaryAverage}>{formatRating(stats.average, stats.count)}</Text>
                <Text style={styles.summaryStars}>{starString(Math.round(stats.average))}</Text>
                <Text style={styles.summaryCount}>
                  {stats.count} rating{stats.count === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.summaryRight}>
                {stats.distribution.map(function (entry) {
                  const ratio = maxBucket > 0 ? entry.count / maxBucket : 0;
                  return (
                    <View key={entry.stars} style={styles.distRow}>
                      <Text style={styles.distStars}>{entry.stars}{'\u2605'}</Text>
                      <View style={styles.distTrack}>
                        <View style={[styles.distBar, { width: ratio * 100 + '%' }]} />
                      </View>
                      <Text style={styles.distCount}>{entry.count}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <StateView mode="empty" message="No reviews submitted yet." />
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerBg,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.danger,
  },
  errorBannerButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.sm,
  },
  errorBannerButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  summary: {
    flexDirection: 'row',
    gap: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  summaryLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  summaryAverage: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.text,
  },
  summaryStars: {
    fontSize: 14,
    color: '#f59e0b',
    marginTop: SPACING.xs,
  },
  summaryCount: {
    marginTop: SPACING.xs,
    fontSize: 12,
    color: COLORS.muted,
  },
  summaryRight: {
    flex: 1,
    justifyContent: 'center',
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  distStars: {
    width: 28,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
  },
  distTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.barTrack,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  distBar: {
    height: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: RADIUS.sm,
  },
  distCount: {
    width: 24,
    textAlign: 'right',
    fontSize: 12,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  author: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  date: {
    fontSize: 12,
    color: COLORS.muted,
  },
  stars: {
    marginTop: SPACING.xs,
    fontSize: 14,
    color: '#f59e0b',
  },
  message: {
    marginTop: SPACING.sm,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.text,
    fontStyle: 'italic',
  },
  noMessage: {
    marginTop: SPACING.sm,
    fontSize: 13,
    color: COLORS.muted,
    fontStyle: 'italic',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  tag: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  orderLabel: {
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    fontSize: 12,
    color: COLORS.muted,
  },
});
