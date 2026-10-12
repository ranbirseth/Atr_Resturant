import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING } from '../theme';

// Shared keyboard-safe shell for the centered form popups (Add Inventory,
// Consume/Restock, Menu item/category, Coupon). It keeps one consistent layout
// so every form behaves the same on a phone and a tablet:
//
//   - KeyboardAvoidingView lifts the card above the on-screen keyboard;
//   - the body is a ScrollView with keyboardShouldPersistTaps="handled" so a
//     tap on a button/chip is not swallowed by the keyboard dismiss;
//   - the card is capped to the available height and the body shrinks, so a
//     long form scrolls instead of pushing the footer buttons off-screen.
//
// `footer` is rendered pinned below the scroll body; `children` are the fields.
export default function FormModal({
  visible = true,
  title,
  subtitle,
  maxWidth = 560,
  onRequestClose,
  children,
  footer,
}) {
  const insets = useSafeAreaInsets();
  // Keep the card clear of the status bar and the Android navigation/gesture
  // bar: the modal window is full-screen edge-to-edge.
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        style={[
          styles.backdrop,
          { paddingTop: SPACING.lg + insets.top, paddingBottom: SPACING.lg + insets.bottom },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.card, { maxWidth: maxWidth }]}>
          {title ? (
            <Text style={[styles.title, subtitle ? null : styles.titleBordered]}>{title}</Text>
          ) : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    maxHeight: '100%',
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  titleBordered: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    padding: SPACING.lg,
  },
  footer: {
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});
