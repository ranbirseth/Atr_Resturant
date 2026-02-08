import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import AdminLayout from './layouts/AdminLayout';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Menu from './pages/Menu';
import Categories from './pages/Categories';
import Users from './pages/Users';
import Coupons from './pages/Coupons';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import AdminAuth from './components/AdminAuth';
import Reviews from './pages/Reviews';
import Billing from './pages/Billing';
import { useAdminAuth } from './hooks/useAdminAuth';
import { Toaster } from 'react-hot-toast';
import OrderNotificationListener from './components/OrderNotificationListener';

function App() {
  const { isAuthenticated, isLoading, login } = useAdminAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Show auth gate if not authenticated
  if (!isAuthenticated) {
    return <AdminAuth onAuthenticated={login} />;
  }

  // Show admin dashboard if authenticated
  return (
    <SocketProvider>
      <Toaster />
      <OrderNotificationListener />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="menu" element={<Menu />} />
            <Route path="categories" element={<Categories />} />
            <Route path="users" element={<Users />} />
            <Route path="coupons" element={<Coupons />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="billing" element={<Billing />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;

