import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';
import { validateCouponForm } from '../../utils/userCouponUtils';

const TYPE_OPTIONS = [
  { key: 'PERCENT', label: 'Percentage (%)' },
  { key: 'FLAT', label: 'Flat Amount (₹)' },
];

function emptyForm() {
  return { code: '', discountType: 'PERCENT', value: '', minOrderAmount: '' };
}

export default function CouponFormModal({ saving, serverError, onClose, onSubmit }) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  function setField(key, value) {
    setForm(function (prev) {
      return { ...prev, [key]: value };
    });
  }

  function handleSave() {
    const result = validateCouponForm(form);
    setErrors(result.errors);
    if (!result.valid) {
      return;
    }
    onSubmit(form);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Create Coupon</Text>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Coupon Code</Text>
            <TextInput
              style={[styles.input, errors.code && styles.inputError]}
              value={form.code}
              onChangeText={(text) => setField('code', text.toUpperCase())}
              placeholder="e.g. SAVE30"
              placeholderTextColor={COLORS.muted}
              autoCorrect={false}
              autoCapitalize="characters"
            />
            {errors.code ? <Text style={styles.fieldError}>{errors.code}</Text> : null}

            <Text style={styles.label}>Discount Type</Text>
            <View style={styles.chips}>
              {TYPE_OPTIONS.map(function (option) {
                const active = form.discountType === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setField('discountType', option.key)}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {errors.discountType ? (
              <Text style={styles.fieldError}>{errors.discountType}</Text>
            ) : null}

            <Text style={styles.label}>
              {form.discountType === 'PERCENT' ? 'Discount (%)' : 'Discount Amount (₹)'}
            </Text>
            <TextInput
              style={[styles.input, errors.value && styles.inputError]}
              value={form.value}
              onChangeText={(text) => setField('value', text)}
              placeholder="e.g. 20"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
            />
            {errors.value ? <Text style={styles.fieldError}>{errors.value}</Text> : null}

            <Text style={styles.label}>Minimum Order Value (₹) — optional</Text>
            <TextInput
              style={[styles.input, errors.minOrderAmount && styles.inputError]}
              value={form.minOrderAmount}
              onChangeText={(text) => setField('minOrderAmount', text)}
              placeholder="e.g. 500"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
            />
            {errors.minOrderAmount ? (
              <Text style={styles.fieldError}>{errors.minOrderAmount}</Text>
            ) : null}

            {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={[styles.button, styles.cancel]} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.save, saving && styles.disabled]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.saveText}>{saving ? 'Creating…' : 'Create Coupon'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
    maxHeight: '92%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  body: {
    padding: SPACING.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  fieldError: {
    marginTop: SPACING.xs,
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  chipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  serverError: {
    marginTop: SPACING.md,
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  button: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  cancel: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: {
    color: COLORS.text,
    fontWeight: '700',
  },
  save: {
    backgroundColor: COLORS.accent,
  },
  saveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
});
