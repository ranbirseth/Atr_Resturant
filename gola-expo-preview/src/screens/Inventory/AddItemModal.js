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
import { computeUnitCost, formatPrice, validateAddItemForm } from '../../utils/inventoryUtils';

function Field({ label, value, onChangeText, error, ...rest }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={COLORS.muted}
        {...rest}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

// Minimal purchase entry: name, unit, total quantity, total price.
// The admin never types a per-unit cost — it is derived from total / quantity.
export default function AddItemModal({ units, saving, serverError, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: '', unit: 'kg', quantity: '', totalPrice: '' });
  const [errors, setErrors] = useState({});

  const unitOptions = (Array.isArray(units) ? units : []).map(function (entry) {
    return typeof entry === 'string' ? entry : entry.name;
  });

  function setField(key, value) {
    setForm(function (prev) {
      return { ...prev, [key]: value };
    });
  }

  const unitCost = computeUnitCost(form.totalPrice, form.quantity);

  function handleSave() {
    if (saving) {
      return;
    }
    const result = validateAddItemForm(form);
    setErrors(result.errors);
    if (!result.valid) {
      return;
    }
    onSubmit({
      name: form.name.trim(),
      unit: form.unit,
      openingQty: Number(form.quantity),
      openingUnitCost: computeUnitCost(form.totalPrice, form.quantity),
      minimumStockLevel: 0,
    });
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Add Inventory</Text>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Field
              label="Item Name"
              value={form.name}
              onChangeText={(text) => setField('name', text)}
              error={errors.name}
              placeholder="e.g. Oil"
            />

            <Text style={styles.label}>Measurement Unit</Text>
            <View style={styles.chips}>
              {(unitOptions.length ? unitOptions : ['kg', 'g', 'litre', 'ml', 'pieces', 'packets']).map(function (unit) {
                const active = form.unit === unit;
                return (
                  <Pressable
                    key={unit}
                    onPress={() => setField('unit', unit)}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{unit}</Text>
                  </Pressable>
                );
              })}
            </View>
            {errors.unit ? <Text style={styles.fieldError}>{errors.unit}</Text> : null}

            <Field
              label="Total Quantity"
              value={form.quantity}
              onChangeText={(text) => setField('quantity', text)}
              error={errors.quantity}
              keyboardType="decimal-pad"
              placeholder="e.g. 10"
            />

            <Field
              label="Total Price"
              value={form.totalPrice}
              onChangeText={(text) => setField('totalPrice', text)}
              error={errors.totalPrice}
              keyboardType="decimal-pad"
              placeholder="e.g. 1500"
            />

            {unitCost !== null ? (
              <Text style={styles.preview}>
                Per-unit cost: {formatPrice(unitCost)}/{form.unit}
              </Text>
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
              <Text style={styles.saveText}>{saving ? 'Adding…' : 'Add Inventory'}</Text>
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
  body: { padding: SPACING.lg },
  field: { marginBottom: SPACING.md },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xs },
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
  inputError: { borderColor: COLORS.danger },
  fieldError: { marginTop: SPACING.xs, color: COLORS.danger, fontSize: 12, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.muted },
  chipTextActive: { color: '#ffffff' },
  preview: { fontSize: 13, fontWeight: '700', color: COLORS.revenue, marginTop: SPACING.xs },
  serverError: { marginTop: SPACING.md, color: COLORS.danger, fontSize: 13, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  button: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center' },
  cancel: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  cancelText: { color: COLORS.text, fontWeight: '700' },
  save: { backgroundColor: COLORS.accent },
  saveText: { color: '#ffffff', fontWeight: '700' },
  disabled: { opacity: 0.6 },
});