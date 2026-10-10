import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import ConnectionStatus from './ConnectionStatus';

// Temporary scaffold screen used by all 8 modules until Phase 2 Step 2+.
// It only proves: React Native app -> Navigation -> existing Node API.
export default function PlaceholderScreen({title}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Module not implemented yet (Phase 2 Step 1)</Text>
      <ConnectionStatus />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#777',
  },
});
