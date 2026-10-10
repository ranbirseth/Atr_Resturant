import React, { useRef, useState } from 'react';
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
import {
  computeUnitCost,
  formatQty,
  toNonNegativeNumber,
  validateMovementForm,
} from '../../utils/inventoryUtils';

const TITLES = {
  CONSUMPTION: 'Consume',
  RESTOCK: 'Restock',
};

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

// Two simple operations only: Consume (quantity + optional note) and Restock
// (quantity + total purchase price, with the per-unit cost derived on submit).
export default function MovementModal({ item, mode, saving, serverError, onClose, onSubmit }) {
  const [quantity, setQuantity] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});

  // One idempotency key per modal open so a duplicated tap can never record a
  // second movement; the backend dedupes against this key.
  const idempotencyKeyRef = useRef(null);

  function idempotencyKey() {
    if (idempotencyKeyRef.current === null) {
      idempotencyKeyRef.current = `${item._id}-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    return idempotencyKeyRef.current;
  }

  function handleSave() {
    if (saving) {
      return;
    }
    const form = mode === 'RESTOCK' ? { quantity, unitCost: totalPrice } : { quantity, note };
    const result = validateMovementForm(form, mode);
    const nextErrors = { ...result.errors };
    if (mode === 'RESTOCK' && toNonNegativeNumber(totalPrice) === null) {
      nextErrors.unitCost = 'Enter 0 or more';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload = {
      ingredientId: item._id,
      type: mode,
      quantity: Number(quantity),
      note: note.trim(),
      idempotencyKey: idempotencyKey(),
    };
    if (mode === 'RESTOCK') {
      payload.unitCost = computeUnitCost(totalPrice, quantity);
    }
    onSubmit(payload);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{TITLES[mode] || 'Stock'}</Text>
          <Text style={styles.subtitle}>
            {item.name} · available {formatQty(item.currentQty, item.unit)}
          </Text>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Field
              label={mode === 'RESTOCK' ? `Quantity Purchased (${item.unit})` : `Quantity to Consume (${item.unit})`}
              value={quantity}
              onChangeText={setQuantity}
              error={errors.quantity}
              keyboardType="decimal-pad"
              placeholder="0"
            />

            {mode === 'RESTOCK' ? (
              <Field
                label="Total Purchase Price"
                value={totalPrice}
                onChangeText={setTotalPrice}
                error={errors.unitCost}
                keyboardType="decimal-pad"
                placeholder="e.g. 600"
              />
            ) : (
              <Field
                label="Note (optional)"
                value={note}
                onChangeText={setNote}
                placeholder="Reason, e.g. lunch service"
                multiline
              />
            )}

            {mode === 'RESTOCK' && computeUnitCost(totalPrice, quantity) !== null ? (
              <Text style={styles.preview}>
                Per-unit cost: {formatQty(computeUnitCost(totalPrice, quantity), '')} / {item.unit}
              </Text>
            ) : null}

            {mode === 'CONSUMPTION' ? (
              <Text style={styles.hint}>Cannot exceed the available quantity.</Text>
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
              <Text style={styles.saveText}>
                {saving ? 'Saving…' : mode === 'RESTOCK' ? 'Confirm Restock' : 'Confirm Consume'}
              </Text>
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
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  subtitle: { fontSize: 13, color: COLORS.muted, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
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
  preview: { fontSize: 13, fontWeight: '700', color: COLORS.revenue },
  hint: { fontSize: 12, color: COLORS.muted },
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