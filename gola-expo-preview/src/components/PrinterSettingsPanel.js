import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import thermalPrinterService from '../services/thermalPrinterService';
import { COLORS, RADIUS, SPACING } from '../theme';

// Printer setup UI shared with the Settings screen. The parent screen owns the
// scroll container so this panel can be embedded alongside other settings.
export default function PrinterSettingsPanel() {
  const [printers, setPrinters] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [connectingAddress, setConnectingAddress] = useState(null);
  const [printingTest, setPrintingTest] = useState(false);

  useEffect(() => {
    thermalPrinterService
      .getSavedPrinterAddress()
      .then(setSelectedAddress)
      .catch((error) => console.error('Could not load the saved printer:', error));
  }, []);

  const refreshPrinters = async () => {
    setRefreshing(true);
    try {
      if (!(await thermalPrinterService.requestPermissions())) {
        Alert.alert(
          'Bluetooth permission required',
          'Allow Bluetooth access in Android settings to find and connect to a printer.',
        );
        return;
      }
      if (!(await thermalPrinterService.ensureBluetoothEnabled())) {
        Alert.alert('Bluetooth is off', 'Turn on Bluetooth to find paired printers.');
        return;
      }
      const pairedPrinters = await thermalPrinterService.getPairedPrinters();
      setPrinters(pairedPrinters);
      if (pairedPrinters.length === 0) {
        Alert.alert(
          'No paired printers found',
          'Pair your printer in Android Bluetooth settings, then refresh this list.',
        );
      }
    } finally {
      setRefreshing(false);
    }
  };

  const connectPrinter = async (printer) => {
    setConnectingAddress(printer.id);
    try {
      const connected = await thermalPrinterService.connect(printer.id);
      if (connected) {
        setSelectedAddress(printer.id);
        Alert.alert('Printer connected', `${printer.name} is ready to print.`);
      } else {
        Alert.alert(
          'Connection failed',
          'Check that the printer is powered on and Bluetooth is enabled, then try again.',
        );
      }
    } finally {
      setConnectingAddress(null);
    }
  };

  const printTestReceipt = async () => {
    setPrintingTest(true);
    try {
      const printed = await thermalPrinterService.printTestReceipt();
      if (printed) {
        Alert.alert('Test receipt sent', 'Check the printer for the test receipt.');
      } else {
        Alert.alert(
          'Print failed, retry?',
          'Check that the printer is on and connected, then try again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Retry', onPress: printTestReceipt },
          ],
        );
      }
    } finally {
      setPrintingTest(false);
    }
  };

  const selectedPrinter = printers.find((printer) => printer.id === selectedAddress);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Thermal Printer</Text>
      <Text style={styles.subtitle}>
        Connect a paired 58mm ESC/POS Bluetooth printer to print bills.
      </Text>

      <View style={styles.selectedBox}>
        <Text style={styles.selectedLabel}>Selected printer</Text>
        <Text style={styles.selectedValue}>
          {selectedAddress
            ? selectedPrinter
              ? `${selectedPrinter.name} (${selectedAddress})`
              : selectedAddress
            : 'No printer selected'}
        </Text>
      </View>

      <Pressable
        style={[styles.primaryButton, refreshing && styles.disabledButton]}
        onPress={refreshPrinters}
        disabled={refreshing}
        accessibilityRole="button">
        {refreshing ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>Refresh Paired Printers</Text>
        )}
      </Pressable>

      {printers.map((printer) => {
        const connecting = connectingAddress === printer.id;
        const selected = selectedAddress === printer.id;
        return (
          <Pressable
            key={printer.id}
            style={[styles.printerRow, selected && styles.selectedPrinterRow]}
            onPress={() => connectPrinter(printer)}
            disabled={connectingAddress !== null}
            accessibilityRole="button">
            <View style={styles.printerDetails}>
              <Text style={styles.printerName}>{printer.name || 'Bluetooth printer'}</Text>
              <Text style={styles.address}>{printer.id}</Text>
            </View>
            <Text style={styles.connectLabel}>
              {connecting ? 'Connecting…' : selected ? 'Selected' : 'Connect'}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        style={[styles.secondaryButton, printingTest && styles.disabledButton]}
        onPress={printTestReceipt}
        disabled={printingTest}
        accessibilityRole="button">
        <Text style={styles.secondaryButtonText}>
          {printingTest ? 'Printing…' : 'Print Test Receipt'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    marginTop: SPACING.xs,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.muted,
  },
  selectedBox: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
  },
  selectedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
  },
  selectedValue: {
    marginTop: SPACING.xs,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  primaryButton: {
    marginTop: SPACING.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  printerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
  },
  selectedPrinterRow: {
    borderColor: COLORS.revenue,
  },
  printerDetails: {
    flex: 1,
  },
  printerName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  address: {
    marginTop: SPACING.xs,
    fontSize: 12,
    color: COLORS.muted,
  },
  connectLabel: {
    marginLeft: SPACING.md,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },
  secondaryButton: {
    marginTop: SPACING.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  secondaryButtonText: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
