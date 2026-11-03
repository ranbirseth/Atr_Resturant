import React from 'react';
import {ScrollView, StyleSheet, Text} from 'react-native';

import PrinterSettingsPanel from '../../components/PrinterSettingsPanel';
import {COLORS, SPACING} from '../../theme';

export default function SettingsScreen() {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}>
      <Text style={styles.pageTitle}>Settings</Text>
      <Text style={styles.pageSubtitle}>
        Configure this device and its hardware.
      </Text>

      <Text style={styles.sectionLabel}>Hardware</Text>
      <PrinterSettingsPanel />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  pageSubtitle: {
    marginTop: SPACING.xs,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.muted,
  },
  sectionLabel: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
});
