import AsyncStorage from '@react-native-async-storage/async-storage';
import RNBluetoothClassicPrinter, {
  EscPos,
  type BluetoothDevice,
} from 'rn-bluetooth-classic-printer';
import { PermissionsAndroid, Platform } from 'react-native';

const PRINTER_ADDRESS_KEY = '@printer_mac_address';
const RECEIPT_WIDTH = 32;

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function receiptAmount(value: number): string {
  return `Rs.${value.toFixed(2)}`;
}

function itemName(item: Record<string, unknown>): string {
  const product = item.item as Record<string, unknown> | undefined;
  const nestedProduct = item.product as Record<string, unknown> | undefined;
  const value = item.name ?? item.title ?? product?.name ?? nestedProduct?.name;
  return typeof value === 'string' && value.trim() ? value.trim() : 'Item';
}

class ThermalPrinterService {
  private connectedAddress: string | null = null;

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    if (Number(Platform.Version) < 31) {
      return true;
    }

    try {
      const permissions = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return (
        permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (error) {
      console.error('Could not request Bluetooth permissions:', error);
      return false;
    }
  }

  async ensureBluetoothEnabled(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    try {
      if (RNBluetoothClassicPrinter.isBluetoothEnabled()) {
        return true;
      }
      return await RNBluetoothClassicPrinter.requestEnableBluetooth();
    } catch (error) {
      console.error('Could not enable Bluetooth:', error);
      return false;
    }
  }

  async getPairedPrinters(): Promise<BluetoothDevice[]> {
    try {
      const devices = await RNBluetoothClassicPrinter.getPairedDevices();
      return devices.filter((device) => {
        const name = device.name?.toLowerCase() ?? '';
        return name.includes('printer') || name.includes('atpos');
      });
    } catch (error) {
      console.error('Could not load paired Bluetooth devices:', error);
      return [];
    }
  }

  async connect(address: string): Promise<boolean> {
    if (!address.trim() || !(await this.requestPermissions())) {
      return false;
    }
    if (!(await this.ensureBluetoothEnabled())) {
      return false;
    }

    try {
      const connected = await RNBluetoothClassicPrinter.connectDevice(address);
      if (!connected) {
        return false;
      }
      this.connectedAddress = address;
      await AsyncStorage.setItem(PRINTER_ADDRESS_KEY, address);
      return true;
    } catch (error) {
      console.error('Could not connect to the Bluetooth printer:', error);
      return false;
    }
  }

  async getSavedPrinterAddress(): Promise<string | null> {
    return AsyncStorage.getItem(PRINTER_ADDRESS_KEY);
  }

  async autoConnect(): Promise<boolean> {
    try {
      const connectedDevice = RNBluetoothClassicPrinter.getConnectedDevice();
      if (connectedDevice?.id) {
        this.connectedAddress = connectedDevice.id;
        return true;
      }

      const address = this.connectedAddress ?? (await this.getSavedPrinterAddress());
      return address ? this.connect(address) : false;
    } catch (error) {
      console.error('Could not reconnect to the saved Bluetooth printer:', error);
      return false;
    }
  }

  async printReceipt(billData: unknown): Promise<boolean> {
    if (!(await this.autoConnect())) {
      return false;
    }

    try {
      const bill =
        billData && typeof billData === 'object'
          ? (billData as Record<string, unknown>)
          : {};
      const lines = Array.isArray(bill.lines)
        ? bill.lines
        : Array.isArray(bill.items)
          ? bill.items
          : [];
      const total = numberValue(bill.grandTotal ?? bill.totalAmount ?? bill.total);
      const commands: string[] = [
        EscPos.INIT,
        EscPos.textCenter(
          `${String(bill.restaurantName || 'GOLA RESTAURANT').slice(0, RECEIPT_WIDTH)}\n`,
        ),
        EscPos.textCenter('BILL\n'),
        EscPos.horizontalLine(),
        EscPos.textLeft(`Bill No: ${bill.billNumber || bill._id || 'N/A'}\n`),
        EscPos.textLeft(
          `Date: ${new Date(String(bill.createdAt || Date.now())).toLocaleString()}\n`,
        ),
        EscPos.horizontalLine(),
      ];

      lines.forEach((value: unknown) => {
        const item =
          value && typeof value === 'object'
            ? (value as Record<string, unknown>)
            : {};
        const quantity = numberValue(item.quantity ?? item.qty, 1);
        const price = numberValue(item.price ?? item.unitPrice);
        const lineTotal = numberValue(item.total ?? item.lineTotal, price * quantity);
        commands.push(
          EscPos.textLeft(`${itemName(item).slice(0, RECEIPT_WIDTH)}\n`),
          EscPos.printJustify(
            `${quantity} x ${receiptAmount(price)}`,
            receiptAmount(lineTotal),
            1,
            RECEIPT_WIDTH,
          ),
        );
      });

      commands.push(EscPos.horizontalLine());
      if (numberValue(bill.discount) > 0) {
        commands.push(
          EscPos.printJustify(
            'Discount',
            receiptAmount(numberValue(bill.discount)),
            1,
            RECEIPT_WIDTH,
          ),
        );
      }
      commands.push(
        EscPos.setAlign(EscPos.Align.RIGHT),
        EscPos.BOLD_ON,
        EscPos.text(`TOTAL: ${receiptAmount(total)}\n`),
        EscPos.BOLD_OFF,
      );
      if (bill.amountPaid != null) {
        commands.push(
          EscPos.textLeft(`Paid: ${receiptAmount(numberValue(bill.amountPaid))}\n`),
        );
      }
      if (bill.balanceDue != null) {
        commands.push(
          EscPos.textLeft(`Balance Due: ${receiptAmount(numberValue(bill.balanceDue))}\n`),
        );
      }
      commands.push(
        EscPos.textCenter('\nThank you for dining with us!\n'),
        EscPos.newLine(3),
        EscPos.cut(),
      );

      return await RNBluetoothClassicPrinter.printRaw(
        EscPos.combineCommands(...commands),
      );
    } catch (error) {
      console.error('Could not print the bill receipt:', error);
      return false;
    }
  }

  async printTestReceipt(): Promise<boolean> {
    if (!(await this.autoConnect())) {
      return false;
    }

    try {
      const testReceipt = EscPos.combineCommands(
        EscPos.INIT,
        EscPos.textCenter('GOLA RESTAURANT\n'),
        EscPos.horizontalLine(),
        EscPos.textCenter('PRINTER TEST\n'),
        EscPos.textCenter('Bluetooth connected.\n'),
        EscPos.newLine(3),
        EscPos.cut(),
      );
      return await RNBluetoothClassicPrinter.printRaw(testReceipt);
    } catch (error) {
      console.error('Could not print the test receipt:', error);
      return false;
    }
  }
}

export default new ThermalPrinterService();
