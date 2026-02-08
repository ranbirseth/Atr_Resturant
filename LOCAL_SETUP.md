# 🚀 Local Development Setup Guide

This guide will help you run the Zink Zaika project entirely on your local machine.

## ✅ Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **MongoDB** (Local installation or MongoDB Atlas) - [Download here](https://www.mongodb.com/try/download/community)
- **Git** - [Download here](https://git-scm.com/)

---

## 📋 Step-by-Step Setup

### 1️⃣ Start MongoDB (if using local MongoDB)

Open a terminal and start MongoDB:

**Windows:**
```bash
# If MongoDB is installed as a service, it should already be running
# Otherwise, navigate to MongoDB bin folder and run:
mongod
```

**Mac/Linux:**
```bash
sudo systemctl start mongod
# or
brew services start mongodb-community
```

---

### 2️⃣ Setup Backend Server

Open a terminal and navigate to the server directory:

```bash
cd server
```

Install dependencies:
```bash
npm install
```

Create a `.env` file in the `server` directory:
```bash
# Copy the example file
copy .env.example .env
```

Edit the `.env` file if needed (default values should work):
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/zink_zaika
ADMIN_SECRET_CODE=ADMIN2024
```

Start the server:
```bash
npm run dev
```

✅ **Server should now be running on http://localhost:5000**

---

### 3️⃣ Setup Client Application

Open a **new terminal** and navigate to the client directory:

```bash
cd client
```

Install dependencies:
```bash
npm install
```

Start the client app:
```bash
npm run dev
```

✅ **Client should now be running on http://localhost:5173**

---

### 4️⃣ Setup Admin Dashboard

Open **another new terminal** and navigate to the AdminDashboard directory:

```bash
cd AdminDashbord
```

Install dependencies:
```bash
npm install
```

Start the admin dashboard:
```bash
npm run dev
```

✅ **Admin Dashboard should now be running on http://localhost:5174**

---

## 🎯 Access Your Application

Once all three services are running:

- **Customer App**: http://localhost:5173
- **Admin Dashboard**: http://localhost:5174
- **Backend API**: http://localhost:5000

### Admin Access
When accessing the Admin Dashboard, you'll be prompted for a secret code.
Use: `ADMIN2024` (or whatever you set in the .env file)

---

## 🔧 Configuration Summary

All URLs are now configured for **local development only**:

### Client (`client/src/config.js`)
- API URL: `http://localhost:5000/api`
- Socket URL: `http://localhost:5000`

### Admin Dashboard (`AdminDashbord/src/config.js`)
- API URL: `http://localhost:5000/api`
- Socket URL: `http://localhost:5000`

### Server (`server/server.js`)
- Accepts connections from:
  - `http://localhost:5173` (Client)
  - `http://localhost:5174` (Admin)

---

## 🛠️ Troubleshooting

### Port Already in Use
If you get an error that a port is already in use:

**For Server (Port 5000):**
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:5000 | xargs kill -9
```

**For Client/Admin (Ports 5173/5174):**
Vite will automatically use the next available port.

### MongoDB Connection Error
- Ensure MongoDB is running
- Check your `MONGO_URI` in the `.env` file
- If using MongoDB Atlas, make sure your IP is whitelisted

### CORS Errors
- Make sure all three services are running
- Check that the URLs in config files match the actual running ports
- Clear browser cache and try again

---

## 📝 Quick Start Commands

Run these in **three separate terminals**:

**Terminal 1 - Server:**
```bash
cd server
npm run dev
```

**Terminal 2 - Client:**
```bash
cd client
npm run dev
```

**Terminal 3 - Admin:**
```bash
cd AdminDashbord
npm run dev
```

---

## 🎉 You're All Set!

Your Zink Zaika restaurant management system is now running entirely on your local machine. No live links or external dependencies required!

Happy coding! 🚀
