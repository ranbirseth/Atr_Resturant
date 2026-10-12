import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import FormModal from '../../components/FormModal';
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
    <FormModal
      title={TITLES[mode] || 'Stock'}
      subtitle={item.name + ' · available ' + formatQty(item.currentQty, item.unit)}
      onRequestClose={onClose}
      footer={
        <>
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
        </>
      }>
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
    </FormModal>
  );
}

const styles = StyleSheet.create({
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
  button: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center' },
  cancel: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  cancelText: { color: COLORS.text, fontWeight: '700' },
  save: { backgroundColor: COLORS.accent },
  saveText: { color: '#ffffff', fontWeight: '700' },
  disabled: { opacity: 0.6 },
});