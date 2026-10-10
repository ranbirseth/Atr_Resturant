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
import { validateItemForm } from '../../utils/menuUtils';

function toInput(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function emptyForm() {
  return {
    name: '',
    category: '',
    price: '',
    staffPrice: '',
    description: '',
    image: '',
    isVeg: true,
    estimatedPreparationTime: '',
    available: true,
    availableForStaff: true,
  };
}

function formFromItem(item) {
  if (!item) {
    return emptyForm();
  }
  return {
    name: toInput(item.name),
    category: item.category || '',
    price: toInput(item.price),
    staffPrice: toInput(item.staffPrice),
    description: toInput(item.description),
    image: toInput(item.image),
    isVeg: item.isVeg !== false,
    estimatedPreparationTime: toInput(item.estimatedPreparationTime),
    available: item.available !== false,
    availableForStaff: item.availableForStaff !== false,
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

export default function ItemFormModal({ item, categories, saving, serverError, onClose, onSubmit }) {
  const [form, setForm] = useState(function () {
    return formFromItem(item);
  });
  const [errors, setErrors] = useState({});

  function setField(key, value) {
    setForm(function (prev) {
      return { ...prev, [key]: value };
    });
  }

  function handleSave() {
    const result = validateItemForm(form);
    setErrors(result.errors);
    if (!result.valid) {
      return;
    }
    const payload = {
      name: form.name.trim(),
      category: form.category,
      price: Number(form.price),
      staffPrice: Number(form.staffPrice),
      description: form.description.trim(),
      image: form.image.trim(),
      isVeg: form.isVeg,
      available: form.available,
      availableForStaff: form.availableForStaff,
    };
    if (String(form.estimatedPreparationTime).trim() !== '') {
      payload.estimatedPreparationTime = Number(form.estimatedPreparationTime);
    }
    onSubmit(payload);
  }

  const categoryOptions = Array.isArray(categories) ? categories : [];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{item ? 'Edit Menu Item' : 'Add Menu Item'}</Text>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Field
              label="Name"
              value={form.name}
              onChangeText={(text) => setField('name', text)}
              error={errors.name}
              placeholder="e.g. Butter Chicken"
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.chips}>
              {categoryOptions.length === 0 ? (
                <Text style={styles.hint}>No categories yet — create one first.</Text>
              ) : (
                categoryOptions.map(function (category) {
                  const active = form.category === category.name;
                  return (
                    <Pressable
                      key={category._id || category.name}
                      onPress={() => setField('category', category.name)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
            {errors.category ? <Text style={styles.fieldError}>{errors.category}</Text> : null}

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Field
                  label="Customer Price (₹)"
                  value={form.price}
                  onChangeText={(text) => setField('price', text)}
                  error={errors.price}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
              <View style={styles.rowItem}>
                <Field
                  label="Staff Price (₹)"
                  value={form.staffPrice}
                  onChangeText={(text) => setField('staffPrice', text)}
                  error={errors.staffPrice}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Field
                  label="Prep Time (min)"
                  value={form.estimatedPreparationTime}
                  onChangeText={(text) => setField('estimatedPreparationTime', text)}
                  error={errors.estimatedPreparationTime}
                  keyboardType="numeric"
                  placeholder="e.g. 15"
                />
              </View>
            </View>

            <Field
              label="Description"
              value={form.description}
              onChangeText={(text) => setField('description', text)}
              placeholder="Short description"
              multiline
            />

            <Field
              label="Image URL"
              value={form.image}
              onChangeText={(text) => setField('image', text)}
              placeholder="https://…"
              autoCapitalize="none"
              keyboardType="url"
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Vegetarian</Text>
              <Switch
                value={form.isVeg}
                onValueChange={(value) => setField('isVeg', value)}
                trackColor={{ true: COLORS.revenue, false: COLORS.border }}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Available for Customers</Text>
              <Switch
                value={form.available}
                onValueChange={(value) => setField('available', value)}
                trackColor={{ true: COLORS.revenue, false: COLORS.border }}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Available for Staff</Text>
              <Switch
                value={form.availableForStaff}
                onValueChange={(value) => setField('availableForStaff', value)}
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
  hint: {
    fontSize: 13,
    color: COLORS.muted,
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
