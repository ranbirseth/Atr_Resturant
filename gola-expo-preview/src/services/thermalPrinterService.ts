type MockPrinter = { id: string; name: string };

// Native printer import intentionally disabled for Expo Go:
// import { connectDevice, EscPos, getConnectedDevice, getPairedDevices, isBluetoothEnabled, printRaw, requestEnableBluetooth } from 'rn-bluetooth-classic-printer';

class ThermalPrinterService {
  async requestPermissions(): Promise<boolean> {
    return true;
  }

  async ensureBluetoothEnabled(): Promise<boolean> {
    return true;
  }

  async getPairedPrinters(): Promise<MockPrinter[]> {
    return [];
  }

  async connect(_address: string): Promise<boolean> {
    return true;
  }

  async getSavedPrinterAddress(): Promise<string | null> {
    return null;
  }

  async autoConnect(): Promise<boolean> {
    return true;
  }

  async printReceipt(_billData: unknown): Promise<boolean> {
    return true;
  }

  async printTestReceipt(): Promise<boolean> {
    return true;
  }
}

export default new ThermalPrinterService();
