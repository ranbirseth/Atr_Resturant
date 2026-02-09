import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { useSocket } from '../context/SocketContext';
import { Bell, X } from 'lucide-react';

const AdminLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notification, setNotification] = useState(null);
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handleNewOrder = (order) => {
      console.log('New Order Received:', order);
      setNotification({
        id: order.orderId || order._id,
        message: `New Order #${(order.orderId || order._id || 'N/A').toString().slice(-6)} received!`,
        total: order.totalAmount,
        type: 'new_order'
      });

      // Auto dismiss after 5 seconds
      setTimeout(() => {
        setNotification(null);
      }, 5000);
    };

    socket.on('newOrder', handleNewOrder);

    return () => {
      socket.off('newOrder', handleNewOrder);
    };
  }, [socket]);

  return (
    <div className="flex min-h-screen bg-bgMain relative">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar onOpenSidebar={() => setIsSidebarOpen(true)} />
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-8 relative">
          <Outlet />
        </main>
      </div>

      {/* Real-time Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right fade-in duration-300">
          <div className="bg-bgCard border-l-4 border-primary shadow-xl rounded-lg p-4 w-80 flex items-start gap-3">
            <div className="bg-primary/10 p-2 rounded-full text-primary">
              <Bell size={20} />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-textPrimary text-sm">New Order Received!</h4>
              <p className="text-textSecondary text-xs mt-1">
                {notification.message}
              </p>
              <p className="text-textMuted text-xs mt-0.5">
                Amount: ₹{notification.total}
              </p>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="text-textDisabled hover:text-textSecondary"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLayout;
