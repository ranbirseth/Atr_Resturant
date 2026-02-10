# 🍽️ Aatreyo Restaurant (Zink Zaika)

A premium, full-stack restaurant management ecosystem. This system bridges the gap between customer ordering, kitchen operations, and administrative management through real-time synchronization and automated physical printing.

---

## 🏗️ System Overview

The Aatreyo Restaurant system consists of four primary components working in harmony:

1.  **Backend (The Brain)**: Centralized Node.js server managing data persistence, business logic, and real-time event broadcasting via Socket.IO.
2.  **Customer App (The Interface)**: Mobile-responsive web app for customers to browse the menu, place orders, and track preparation in real-time.
3.  **Admin Dashboard (The Command Center)**: A powerful dashboard for staff to manage live orders, monitor sessions, generate bills, and analyze business performance.
4.  **Print Service (The Output)**: A lightweight local service that enables the Web-based Admin Dashboard to communicate with physical thermal printers for instant KOT and Bill printing.

---

## 📱 Customer App (Client)

### 🚀 Key Features
- **Smart Menu**: Categorized menu with "Veg/Non-Veg" indicators and customization options.
- **Session-Based Ordering**: Customers can place multiple orders during a single visit; the system automatically groups them into one session.
- **Dynamic Cart**: A premium cart experience with upsell suggestions based on table-pairing psychology.
- **Real-Time Tracking**: A countdown page that appears immediately after ordering, allowing customers to see exactly when their food is accepted, prepared, and ready.
- **Table Integration**: Built-in support for table numbers, ensuring staff know exactly where to serve the food.

### 🛠️ Technical Details
- **Technology**: React.js + Vite for lightning-fast speeds.
- **Styling**: Tailored Tailwind CSS for a premium dark-mode/gold aesthetic.
- **Communication**: Uses Axios for API calls and Socket.IO for real-time status updates from the kitchen.

---

## 👑 Admin Dashboard

### 🚀 Key Features
- **Grouped Order View**: Instead of a messy list of individual items, orders are grouped by "Customer Session." This allows you to manage a single table's entire visit in one place.
- **Individual Order Badges**: Every order within a session has its own status badge (Placed, Accepted, Preparing, Ready, Completed, or Canceled).
- **One-Click KOT**: Accepting an order automatically triggers a Kitchen Order Ticket (KOT) on your local thermal printer.
- **Professional Billing**: Generate beautiful PDF bills. You can download them locally or share them directly with the customer via WhatsApp.
- **Advanced Analytics**: track Revenue Trends, Top Selling Items, and Peak Order Times with interactive charts.

### 🛠️ Technical Details
- **Technology**: React.js with `recharts` for data visualization.
- **Billing Engine**: Uses `jsPDF` and `jspdf-autotable` for precise document generation.
- **State Management**: Context-aware architecture ensures the dashboard stays in sync with the server without manual refreshing.

---

## 🖨️ Local Print Service

### 🚀 Key Features
- **Bridge Technology**: Solves the limitation of web browsers not being able to communicate directly with USB/Network printers.
- **Silent & Automatic**: Once configured, it runs in the background. When the Admin accepts an order, it prints instantly without any "Print Dialog" popups.
- **Multi-Printer Support**: Capable of sending KOTs to the kitchen and duplicate bills to the counter simultaneously.
- **Safety First**: Includes a print queue to handle multiple orders arriving at the same time without losing any data.

### 🛠️ Technical Details
- **Technology**: Lightweight Node.js Express server.
- **Printer Communication**: Uses `pdf-to-printer` for native Windows printer spooling.
- **Startup**: Includes a `start_printer.bat` file for easy "one-click" startup by restaurant staff.

---

## 🔄 The Lifecycle of an Order

1.  **Placement**: Customer scans a QR code (table-specific) and places an order on the **Client App**.
2.  **Notification**: The **Backend** broadcasts a "New Order" event. The **Admin Dashboard** rings and shows a notification.
3.  **Acceptance**: Staff clicks "Accept Order" in the **Admin Dashboard**.
4.  **KOT Generation**: The Dashboard tells the **Local Print Service** to print. The Kitchen Printer instantly spits out the KOT.
5.  **Preparation**: Staff clicks "Start Preparing" then "Mark as Ready" as work progresses. The **Customer App** updates in real-time.
6.  **Billing**: At the end of the visit, the Admin clicks "Generate Bill," creating a summarized PDF of all orders in that session.

---

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (v18+)
- MongoDB (Local or Atlas)

### 1. Server Setup
```bash
cd server
npm install
# Configure .env
npm start
```

### 2. Client & Admin Setup
```bash
# For both /client and /AdminDashbord
npm install
npm run dev
```

### 3. Printer Setup
1. Open `print-service/printer.js` and set your printer names.
2. Run `print-service/start_printer.bat`.

---

## 📄 License & Credits
Developed for **Zink Zaika / Aatreyo Restaurant**. 
Built with ❤️ by the Aatreyo Dev Team. Proprietary Software.
