import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../theme';
import { validateCategoryForm } from '../../utils/menuUtils';

function emptyForm() {
  return { name: '', customerVisible: true, staffVisible: true };
}

function formFromCategory(category) {
  if (!category) {
    return emptyForm();
  }
  return {
    name: category.name || '',
    customerVisible: category.customerVisible !== false && category.isVisible !== false,
    staffVisible: category.staffVisible !== false,
  };
}

export default function CategoryFormModal({ category, saving, serverError, onClose, onSubmit }) {
  const [form, setForm] = useState(function () {
    return formFromCategory(category);
  });
  const [errors, setErrors] = useState({});

  function setField(key, value) {
    setForm(function (prev) {
      return { ...prev, [key]: value };
    });
  }

  function handleSave() {
    const result = validateCategoryForm(form);
    setErrors(result.errors);
    if (!result.valid) {
      return;
    }
    // Keep the legacy `isVisible` flag in sync with the customer toggle so the
    // customer site and the new dual-audience flags never disagree.
    onSubmit({
      name: form.name.trim(),
      isVisible: form.customerVisible,
      customerVisible: form.customerVisible,
      staffVisible: form.staffVisible,
    });
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{category ? 'Edit Category' : 'Add Category'}</Text>

          <View style={styles.body}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              value={form.name}
              onChangeText={(text) => setField('name', text)}
              placeholder="e.g. Starters"
              placeholderTextColor={COLORS.muted}
            />
            {errors.name ? <Text style={styles.fieldError}>{errors.name}</Text> : null}

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Visible to Customers</Text>
              <Switch
                value={form.customerVisible}
                onValueChange={(value) => setField('customerVisible', value)}
                trackColor={{ true: COLORS.revenue, false: COLORS.border }}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Visible to Staff</Text>
              <Switch
                value={form.staffVisible}
                onValueChange={(value) => setField('staffVisible', value)}
                trackColor={{ true: COLORS.revenue, false: COLORS.border }}
              />
            </View>

            {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}
          </View>

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
    width: '100%',
    maxWidth: 520,
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
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
