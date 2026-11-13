# 🍽️ GOLA Restaurant Management System   ____

A premium, full-stack restaurant management ecosystem designed for speed, accuracy, and real-time operations. The system bridges the gap between customer ordering, kitchen operations, administrative management, and direct thermal printing.

---

## 🏗️ System Overview

The GOLA Restaurant system consists of four primary components working in harmony:

1.  **Backend (The Brain)**: Centralized Node.js server managing data persistence, business logic, authentication, and real-time event broadcasting via Socket.IO.
2.  **Mobile Admin App (The Command Center)**: A powerful React Native (Expo) application allowing administrators to manage live orders, generate bills, print receipts, and analyze business performance directly from an Android device.
3.  **Customer App (The Interface)**: Mobile-responsive web app for customers to browse the menu, place orders, and track preparation in real-time.
4.  **Web Admin Dashboard (Legacy/Ecosystem)**: A web-based dashboard for staff to manage sessions, generate PDF bills, and analyze data (used alongside the Mobile App).

---

## 📱 Mobile Admin App (Expo / React Native)

This is the primary tool for restaurant administrators, featuring direct hardware integration.

### 🚀 Key Features
- **Direct Bluetooth Printing**: Connects directly to thermal printers (ATPOS H-58BT) via Bluetooth Classic. No external print service required. Prints text-based receipts and embedded payment QR codes.
- **Advanced Dashboard Metrics**:
  - **Today's Revenue**: Automatically includes paid orders, customer bills, and settled staff ledgers.
  - **Staff Ledger**: A log of all staff purchases (items, price, time) with filters for Today, 7 Days, and 30 Days. Clicking "Settle" records the payment and adds it to the system revenue.
  - **Inventory Cost**: Calculates the monetary value of ingredients consumed today based on stock movements.
  - **Bills Today Split**: Separates bill metrics into "Total", "Staff Payments", and "Customer Payments" for clear financial visibility.
- **Smart Billing**: Add items with images, apply manual discounts, and generate bills. Supports separate pricing for Customers and Staff.
- **Order Management**: Record payments securely (with idempotency protection to prevent double-charging) and filter orders by date.
- **Printer Settings**: Built-in UI to pair, connect, and test the thermal printer.

### 🛠️ Technical Details
- **Technology**: React Native, Expo, React Navigation.
- **Hardware Integration**: `rn-bluetooth-classic-printer` for ESC/POS commands.
- **State Management**: Context API / custom hooks for real-time sync.
- **Build System**: EAS (Expo Application Services) for generating production APKs.

---

## 👑 Backend Server (Node.js & MongoDB)

### 🚀 Key Features
- **Authoritative Pricing**: The server calculates all bill totals, staff prices, and taxes authoritatively to prevent frontend manipulation.
- **Session Grouping**: Groups individual orders into customer sessions for easier management.
- **Inventory Deduction**: Automatically adjusts stock levels when consumption is recorded.
- **Idempotent Payments**: Uses idempotency keys to ensure network retries never result in double charges.
- **Socket.IO Integration**: Broadcasts order status updates instantly to the Customer App and Admin Dashboard.

### 🛠️ Technical Details
- **Technology**: Node.js, Express.js, MongoDB (Mongoose).
- **Hosting**: Render (Production) / Localhost (Development).
- **Database**: MongoDB Atlas (Production) / Local MongoDB.

---

## 🖨️ Hardware & Printing Integration

### Supported Hardware
- **Printer Model**: ATPOS H-58BT (58mm Thermal Receipt Printer).
- **Connectivity**: Bluetooth Classic (SPP).
- **Protocol**: ESC/POS.

### Printing Capabilities
- **Text Receipts**: Formats item lists, totals, and branding for 58mm paper.
- **Payment QR Codes**: Converts the `payment-qr.png` image into a monochrome raster bitmap (`GS v 0` command) and prints it directly on the receipt.
- **Reprint Safety**: Printing an existing bill does not create a new transaction in the database.

---

## 🔄 The Lifecycle of a Bill & Payment

1. **Placement**: Staff opens the Billing screen, selects items (with live images), and chooses the audience (Customer or Staff).
2. **Generation**: The Admin clicks "Generate Bill". The backend calculates totals, applies any manual discounts, and creates a bill record.
3. **Printing**: The Admin taps "Print". The mobile app formats the data into ESC/POS commands, connects via Bluetooth, and prints the physical receipt (including the QR code).
4. **Revenue Sync**: If it's a Customer bill, the amount is added to the Dashboard revenue instantly. If it's a Staff bill, it waits in the Staff Ledger until the Admin clicks "Settle".

---

## 🛠️ Installation & Setup
## 🔗 Quick Links
- [Download the Android APK](https://drive.google.com/file/d/1n0su2VH8bQlNoHPFEXvZEYk8YE5BRb8w/view?usp=sharing)

  
### Prerequisites
- Node.js (v18+)
- Android Device (for testing the Mobile App)
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)

### 1. Backend Setup
```bash
cd server
npm install
# Configure .env (MONGO_URI, JWT_SECRET, etc.)
npm run dev
