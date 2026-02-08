import React, { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';
import { Bell, Utensils } from 'lucide-react';

const OrderNotificationListener = () => {
    const socket = useSocket();

    useEffect(() => {
        if (!socket) return;

        const handleNewOrder = (data) => {
            console.log('🔔 New Order Notification:', data);
            
            // Play notification sound
            try {
                const audio = new Audio('/notification.mp3'); // Ensure this file exists in public folder or use a remote URL
                audio.play().catch(e => console.log('Audio play failed', e));
            } catch (error) {
                console.error("Audio Error:", error);
            }

            // Show custom toast
            toast((t) => (
                <div 
                    onClick={() => {
                        toast.dismiss(t.id);
                        window.location.href = '/orders'; // Navigate to orders on click
                    }}
                    className="flex items-start cursor-pointer w-full"
                >
                    <div className="flex-shrink-0 pt-0.5">
                        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <Utensils className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                    <div className="ml-3 flex-1">
                        <p className="text-sm font-medium text-gray-900">
                            New Order Received!
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                            {data.orderType} • {data.tableNumber ? `Table ${data.tableNumber}` : 'Delivery/Takeaway'}
                        </p>
                        <p className="mt-1 text-xs font-bold text-primary">
                            ₹{data.totalAmount} • {data.itemsCount} Items
                        </p>
                    </div>
                </div>
            ), {
                duration: 5000,
                position: 'top-right',
                style: {
                    background: '#fff',
                    color: '#333',
                    borderLeft: '4px solid #DC9D1D',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                },
            });
        };

        socket.on('newOrder', handleNewOrder);

        return () => {
            socket.off('newOrder', handleNewOrder);
        };
    }, [socket]);

    return null; // This component doesn't render anything itself
};

export default OrderNotificationListener;
