
# Zink Zaika – Advanced Restaurant Management System

Zink Zaika is a full-stack, production-ready restaurant management platform. It features a modern, mobile-first customer ordering app and a powerful real-time admin dashboard, both built with React and Vite, and a robust Node.js/Express backend with MongoDB. The system is designed for seamless restaurant operations, real-time order management, and analytics.

---

## 🌟 Key Features & Architecture

### 1. Customer Application (Client)

- **Interactive Menu & Search**
	- Browse food items by category, with instant search and filtering.
	- Menu data is fetched from the backend and cached for performance.

- **Cart & Order Customization**
	- Add/remove items, adjust quantities, and customize orders.
	- Cart state is managed via React Context for persistence across navigation.

- **Order Placement & Real-Time Status**
	- Place dine-in or takeaway orders.
	- Order status updates in real-time (Pending → Preparing → Ready) via Socket.IO.

- **Coupon System**
	- Apply discount codes at checkout.
	- Coupon validation is handled server-side for security.

- **Upsell Modal**
	- Intelligent upsell suggestions based on cart contents, using backend rules.

- **User Authentication**
	- Phone number-based login; new users are auto-registered.

---

### 2. Admin Dashboard

- **Authentication**
	- Secured with a secret admin code (from environment variables).
	- Session persists via local storage and context.

- **Real-Time Order Management**
	- Live order feed with instant notifications for new/updated orders (Socket.IO).
	- Update order status, view order details, and manage sessions.

- **Menu & Category Management**
	- Add, edit, or delete menu items and categories.
	- Menu changes are reflected instantly for all users.

- **User & Coupon Management**
	- View all registered users and their order history.
	- Create, edit, and delete coupons with usage tracking.

- **Analytics & Reporting**
	- Visual dashboards (Recharts) for sales, order trends, and category performance.
	- Exportable reports (future roadmap).

- **Session Grouping**
	- Orders are grouped by session for easier management during busy hours.

---

### 3. Backend (Server)

- **RESTful API**
	- Modular Express routes for auth, admin, items, orders, coupons, feedback, and upsell logic.
	- Centralized error handling and validation.

- **Database**
	- MongoDB with Mongoose ODM.
	- Models for User, Order, Item, Category, Coupon, Feedback.

- **Real-Time Communication**
	- Socket.IO for instant updates between client, admin, and kitchen.

- **Security**
	- Environment-based secrets, CORS configuration, and input validation.

- **Extensible Architecture**
	- Easily add new features (e.g., payment gateways, advanced analytics).

---

## 🗂️ Project Structure

```
Zink_zaika/
├── client/           # Customer React app (Vite, Tailwind, Context)
├── AdminDashbord/    # Admin React app (Vite, Tailwind, Recharts, Socket.IO)
├── server/           # Node.js/Express backend (MongoDB, Socket.IO)
└── README.md         # This file
```

---

## ⚙️ How It Works

### Data Flow

1. **Menu & Orders**
	 - Menu data is fetched from the backend and displayed in both client and admin apps.
	 - Orders placed by customers are sent to the backend, stored in MongoDB, and broadcast to the admin dashboard in real-time.

2. **Order Status**
	 - Admin updates order status (e.g., Preparing, Ready).
	 - Status changes are pushed to the customer app instantly via Socket.IO.

3. **Coupons & Upsell**
	 - Coupons are validated server-side.
	 - Upsell suggestions are generated using backend rules and shown in the client app.

4. **Analytics**
	 - Sales and order data are aggregated and visualized in the admin dashboard.

---

## 🛠️ Tech Stack

- **Frontend:** React.js (Vite), Tailwind CSS, Recharts, Framer Motion, Lucide React, Socket.IO Client
- **Backend:** Node.js, Express.js, MongoDB (Mongoose), Socket.IO, Dotenv, CORS
- **Dev Tools:** ESLint, Prettier, Nodemon, Vercel (deployment)

---

## 🚀 Setup & Installation

### Prerequisites

- Node.js v14+
- MongoDB (local or Atlas)
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/ranbirseth/resturant.git
cd resturant
```

### 2. Backend Setup

```bash
cd server
npm install
# Configure .env (see .env.example)
npm run dev
# Runs on http://localhost:5000
```

### 3. Admin Dashboard

```bash
cd AdminDashbord
npm install
npm run dev
# Runs on http://localhost:5174
```

### 4. Client App

```bash
cd client
npm install
npm run dev
# Runs on http://localhost:5173
```

---

## 🔌 API Endpoints

- `/api/auth` – User login/registration
- `/api/admin` – Admin verification
- `/api/items` – Menu CRUD
- `/api/orders` – Order management
- `/api/coupons` – Coupon validation/management
- `/api/feedback` – Customer feedback
- `/api/upsell` – Upsell logic

---

## 🔐 Authentication

- **Users:** Phone number login, auto-registration.
- **Admins:** Secret code (set in `.env` as `ADMIN_SECRET_CODE`).

---

## 🧩 Extending the System

- **Add Payment Gateway:** Integrate Stripe/Razorpay in both client and backend.
- **Advanced Analytics:** Add exportable reports and more granular metrics.
- **Dark Mode:** Implement Tailwind dark mode in client app.
- **JWT Auth:** Upgrade admin authentication to JWT for enhanced security.

---

## 📝 Contribution Guide

1. Fork the repo and create a feature branch.
2. Make your changes and commit with clear messages.
3. Push and open a pull request.

---

## 📄 License

MIT License. See `LICENSE` for details.

---

## 📞 Support

For issues, open a GitHub issue or contact the maintainer.

---

This README provides a comprehensive overview for developers, contributors, and advanced users. For further details, see the codebase and documentation files.
