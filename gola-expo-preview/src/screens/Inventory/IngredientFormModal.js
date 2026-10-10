import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';
import { validateIngredientForm } from '../../utils/inventoryUtils';

function toInput(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function emptyForm() {
  return {
    name: '',
    unit: 'kg',
    minimumStockLevel: '',
    expectedDemand: '',
    openingQty: '',
    isActive: true,
  };
}

function formFromIngredient(ingredient) {
  if (!ingredient) {
    return emptyForm();
  }
  return {
    name: toInput(ingredient.name),
    unit: ingredient.unit || 'kg',
    minimumStockLevel: toInput(ingredient.minimumStockLevel),
    expectedDemand: toInput(ingredient.expectedDemand),
    openingQty: '',
    isActive: ingredient.isActive !== false,
  };
}

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

export default function IngredientFormModal({ ingredient, units, saving, serverError, onClose, onSubmit }) {
  const [form, setForm] = useState(function () {
    return formFromIngredient(ingredient);
  });
  const [errors, setErrors] = useState({});

  const unitOptions = (Array.isArray(units) ? units : []).map(function (entry) {
    return typeof entry === 'string' ? entry : entry.name;
  });

  function setField(key, value) {
    setForm(function (prev) {
      return { ...prev, [key]: value };
    });
  }

  function handleSave() {
    const result = validateIngredientForm(form);
    setErrors(result.errors);
    if (!result.valid) {
      return;
    }

    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      minimumStockLevel: Number(form.minimumStockLevel),
      expectedDemand: String(form.expectedDemand).trim() === '' ? 0 : Number(form.expectedDemand),
      isActive: form.isActive,
    };
    if (!ingredient && String(form.openingQty).trim() !== '') {
      payload.openingQty = Number(form.openingQty);
    }
    onSubmit(payload);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{ingredient ? 'Edit Inventory Item' : 'Add Inventory Item'}</Text>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Field
              label="Name"
              value={form.name}
              onChangeText={(text) => setField('name', text)}
              error={errors.name}
              placeholder="e.g. Basmati Rice"
            />

            <Text style={styles.label}>Measurement Unit</Text>
            <View style={styles.chips}>
              {unitOptions.map(function (unit) {
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

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Field
                  label="Minimum Stock Level"
                  value={form.minimumStockLevel}
                  onChangeText={(text) => setField('minimumStockLevel', text)}
                  error={errors.minimumStockLevel}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
              <View style={styles.rowItem}>
                <Field
                  label="Expected Demand"
                  value={form.expectedDemand}
                  onChangeText={(text) => setField('expectedDemand', text)}
                  error={errors.expectedDemand}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
            </View>

            {!ingredient ? (
              <Field
                label="Opening Quantity (optional)"
                value={form.openingQty}
                onChangeText={(text) => setField('openingQty', text)}
                error={errors.openingQty}
                keyboardType="numeric"
                placeholder="0"
              />
            ) : null}

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Active</Text>
              <Switch
                value={form.isActive}
                onValueChange={(value) => setField('isActive', value)}
                trackColor={{ true: COLORS.revenue, false: COLORS.border }}
              />
            </View>

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
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
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
    maxWidth: 720,
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
  field: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
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
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  rowItem: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
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
