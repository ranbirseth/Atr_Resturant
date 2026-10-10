import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';

export default function SearchBar({ value, onChangeText, placeholder }) {
  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || 'Search customer, mobile or session ID'}
        placeholderTextColor={COLORS.muted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} style={styles.clear} hitSlop={8}>
          <Text style={styles.clearText}>{'\u2715'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  input: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: 14,
    color: COLORS.text,
  },
  clear: {
    paddingLeft: SPACING.sm,
  },
  clearText: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: '700',
  },
});
