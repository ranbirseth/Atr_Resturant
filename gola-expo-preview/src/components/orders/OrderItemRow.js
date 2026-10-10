import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';

export default function OrderItemRow({ item }) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const quantity = item.quantity != null ? item.quantity : 1;
  const name = typeof item.name === 'string' && item.name.trim() ? item.name : 'Item';
  const customizations = Array.isArray(item.customizations)
    ? item.customizations.filter(function (value) {
        return value != null && String(value).trim() !== '';
      })
    : [];

  return (
    <View style={styles.row}>
      <View style={styles.qtyBox}>
        <Text style={styles.qtyText}>{quantity}x</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{name}</Text>
        {customizations.length > 0 ? (
          <View style={styles.chips}>
            {customizations.map(function (custom, index) {
              return (
                <Text key={index} style={styles.chip}>
                  {custom}
                </Text>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: SPACING.sm,
  },
  qtyBox: {
    minWidth: 30,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  qtyText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
  },
  body: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.xs,
  },
  chip: {
    fontSize: 10,
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
    marginRight: SPACING.xs,
    marginTop: SPACING.xs,
  },
});
