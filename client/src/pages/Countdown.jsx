import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { CheckCircle, Clock } from 'lucide-react';
import FeedbackModal from '../components/FeedbackModal';
import axios from 'axios';
import API_URL from '../config';

const Countdown = () => {
  const navigate = useNavigate();
  const { currentOrderId, user } = useContext(AppContext);
    // 2 minutes for cancel/change
    const [actionTimeLeft, setActionTimeLeft] = useState(120);
  const [isReady, setIsReady] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

    useEffect(() => {
        if (!currentOrderId) return;

        const fetchOrderAndPoll = async () => {
                try {
                        const res = await axios.get(`${API_URL}/orders/${currentOrderId}`);
                        const order = res.data;
                        if (order.status === 'Completed' || order.status === 'Ready') {
                                setIsReady(true);
                        }
                        if (order.feedbackStatus === 'Requested' || order.status === 'Completed') {
                                if (order.feedbackStatus !== 'Submitted' && order.feedbackStatus !== 'Skipped') {
                                     setShowFeedback(true);
                                }
                        }
                } catch (error) {
                        console.error("Polling error", error);
                }
        };

        fetchOrderAndPoll(); // Initial call
        const pollStatus = setInterval(fetchOrderAndPoll, 5000); // Check every 5 seconds
        return () => clearInterval(pollStatus);
    }, [currentOrderId]);

    // 2 minute action timer
    useEffect(() => {
        if (actionTimeLeft <= 0) {
            navigate('/home');
            return;
        }
        const timer = setInterval(() => {
            setActionTimeLeft(prev => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [actionTimeLeft, navigate]);






    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-gradient-to-br from-amber-50 via-orange-100 to-yellow-100">
            <div className="w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-200">
                <CheckCircle className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-black text-gray-900 mb-2">Order Placed!</h1>
            <p className="text-gray-600 mb-8">Thank you for your order. You can cancel or change your order within 2 minutes.</p>

            {actionTimeLeft > 0 && (
                <div className="flex flex-col gap-4 items-center mb-8">
                    <button
                        onClick={async () => {
                            if (!currentOrderId) return;
                            try {
                                console.log('🔴 Cancelling order:', currentOrderId);
                                const response = await axios.put(`${API_URL}/orders/${currentOrderId}/status`, { status: 'Cancelled' });
                                console.log('✅ Cancel response:', response.data);
                                navigate('/home');
                            } catch (err) {
                                console.error('❌ Cancel error:', err);
                                alert('Failed to cancel order.');
                            }
                        }}
                        className="bg-red-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-red-600 transition-all"
                    >
                        Cancel Order
                    </button>
                    <button
                        onClick={async () => {
                            if (!currentOrderId) return;
                            try {
                                console.log('🟠 Requesting order change:', currentOrderId);
                                const response = await axios.put(`${API_URL}/orders/${currentOrderId}/status`, { status: 'ChangeRequested' });
                                console.log('✅ Change response:', response.data);
                                navigate('/cart');
                            } catch (err) {
                                console.error('❌ Change error:', err);
                                alert('Failed to request order change.');
                            }
                        }}
                        className="bg-yellow-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-yellow-600 transition-all"
                    >
                        Change Order
                    </button>
                    <div className="text-sm text-gray-500">This option will disappear in {actionTimeLeft} seconds.</div>
                    
                    <button
                        onClick={() => navigate('/home')}
                        className="mt-4 px-8 py-3 rounded-xl font-bold text-primary border-2 border-primary hover:bg-primary hover:text-bgMain transition-all uppercase tracking-widest text-sm"
                    >
                        Browse Menu / Order More
                    </button>
                </div>
            )}

            {isReady && (
                <div className="animate-in zoom-in duration-500">
                    <h2 className="text-2xl font-bold text-green-700 mb-2">Order Ready!</h2>
                    <p className="text-gray-600 mb-8">Your food is ready to be served/picked up.</p>
                    <button
                        onClick={() => navigate('/home')}
                        className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-green-700 transition-all"
                    >
                        Order More
                    </button>
                </div>
            )}

            {showFeedback && currentOrderId && (
                <FeedbackModal
                    orderId={currentOrderId}
                    userId={user?._id}
                    onClose={() => setShowFeedback(false)}
                />
            )}

            {/* DEV ONLY: TRIGGER FEEDBACK */}
            <div className="fixed bottom-4 right-4 opacity-50 hover:opacity-100">
                <button
                    onClick={async () => {
                        await axios.put(`${API_URL}/orders/${currentOrderId}/status`, {
                            status: 'Completed',
                            feedbackStatus: 'Requested'
                        });
                        setIsReady(true);
                    }}
                    className="bg-green-700 text-white text-xs px-2 py-1 rounded shadow-lg"
                >
                    DEV: Complete Order
                </button>
            </div>

    </div>
  );
};

export default Countdown;
