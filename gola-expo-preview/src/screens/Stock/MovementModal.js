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
import { parseDateInput, todayISO, validateMovementForm } from '../../utils/inventoryUtils';

const TITLES = {
  CONSUMPTION: 'Record Consumption',
  RESTOCK: 'Restock Item',
  ADJUSTMENT: 'Adjust Stock',
};

const HINTS = {
  CONSUMPTION: 'Quantity used (cannot exceed what is available).',
  RESTOCK: 'Quantity added. This starts a new usage cycle.',
  ADJUSTMENT: 'Correction amount. Use a minus sign to reduce the balance.',
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

export default function MovementModal({ item, mode, saving, serverError, onClose, onSubmit }) {
  const [quantity, setQuantity] = useState('');
  const [quantityDelta, setQuantityDelta] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});

  function handleSave() {
    const form = mode === 'ADJUSTMENT' ? { quantityDelta, date } : { quantity, date };
    const result = validateMovementForm(form, mode);
    setErrors(result.errors);
    if (!result.valid) {
      return;
    }

    const payload = {
      ingredientId: item._id,
      type: mode,
      movementDate: parseDateInput(date).toISOString(),
      note: note.trim(),
      idempotencyKey: `${item._id}-${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    if (mode === 'ADJUSTMENT') {
      payload.quantityDelta = Number(quantityDelta);
    } else {
      payload.quantity = Number(quantity);
    }
    onSubmit(payload);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{TITLES[mode] || 'Stock Movement'}</Text>
          <Text style={styles.subtitle}>
            {item.name} · available {item.currentQty} {item.unit}
          </Text>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {mode === 'ADJUSTMENT' ? (
              <Field
                label="Adjustment Quantity (+/-)"
                value={quantityDelta}
                onChangeText={setQuantityDelta}
                error={errors.quantityDelta}
                keyboardType="numbers-and-punctuation"
                placeholder="e.g. -2 or 3"
              />
            ) : (
              <Field
                label={`Quantity (${item.unit})`}
                value={quantity}
                onChangeText={setQuantity}
                error={errors.quantity}
                keyboardType="numeric"
                placeholder="0"
              />
            )}
            <Text style={styles.hint}>{HINTS[mode]}</Text>

            <Field
              label="Date (YYYY-MM-DD)"
              value={date}
              onChangeText={setDate}
              error={errors.date}
              autoCapitalize="none"
              placeholder={todayISO()}
            />

            <Field
              label="Note (optional)"
              value={note}
              onChangeText={setNote}
              placeholder="Optional note"
              multiline
            />

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
    maxWidth: 640,
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
  hint: { fontSize: 12, color: COLORS.muted, marginTop: -SPACING.xs, marginBottom: SPACING.md },
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
