import React, { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { ArrowLeft, PlayCircle, Utensils, ShoppingBag } from 'lucide-react';
import CouponInput from '../components/CouponInput';
import CouponCard from '../components/CouponCard';
import axios from 'axios';
import API_URL from '../config';

const OrderType = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { placeOrder, user, cart, getCartTotal, applyCoupon, removeCoupon, coupon, getFinalTotal } = useContext(AppContext);
  const [orderType, setOrderType] = useState(null); // 'Dine-in' | 'Takeaway'
  const [tableNumber, setTableNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [coupons, setCoupons] = useState([]);
  
  // New State for Delivery
  const [isDelivery, setIsDelivery] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');

  React.useEffect(() => {
    // Fetch available coupons
    axios.get(`${API_URL}/coupons`)
        .then(res => setCoupons(res.data))
        .catch(err => console.error(err));
  }, []);

  const handleApplyCoupon = async (code) => {
    setLoading(true);
    const result = await applyCoupon(code);
    setLoading(false);
    if (!result.success) {
        alert(result.message);
    }
  };

  const addons = location.state?.addons || {};

  const handlePlaceOrder = async () => {
    if (!orderType) return;
    if (orderType === 'Dine-in' && !tableNumber) return;
    if (isDelivery && !deliveryAddress.trim()) {
        alert("Please enter a valid delivery address.");
        return;
    }

    setLoading(true);
    // Construct Order Data
    const orderData = {
        userId: user._id,
        items: cart.map(item => ({
            itemId: item._id, // assuming item has _id
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            customizations: Object.keys(addons).filter(k => addons[k]) // simplified
        })),
        totalAmount: getFinalTotal(), 
        grossTotal: getCartTotal(),
        couponCode: coupon?.code,
        discountAmount: coupon?.discountAmount,
        orderType,
        tableNumber: orderType === 'Dine-in' ? tableNumber : undefined,
        // Delivery Fields
        isDelivery: isDelivery,
        deliveryAddress: isDelivery ? deliveryAddress : undefined
    };

    console.log('🛒 Client placing order:', {
        orderType,
        isDelivery,
        deliveryAddress,
        fullOrderData: orderData
    });

    try {
        await placeOrder(orderData);
        navigate('/countdown');
    } catch (error) {
        alert("Failed to place order");
    }
    setLoading(false);
  };

  return (

    <div className="min-h-screen bg-bgMain pb-32">
      <div className="sticky top-0 bg-bgHeader p-6 flex items-center gap-4 border-b border-borderColor/30 z-10 shadow-lg">
        <button onClick={() => navigate(-1)} className="text-textSecondary hover:text-primary transition-colors">
            <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold text-primary font-serif tracking-wide uppercase">Dining Option</h1>
      </div>

      <div className="p-6 max-w-2xl mx-auto">
        <h2 className="text-xl font-bold text-white mb-8 font-serif uppercase tracking-tight">How would you like to eat?</h2>

        <div className="grid grid-cols-2 gap-6 mb-12">
            <div 
                onClick={() => {
                    setOrderType('Dine-in');
                    setIsDelivery(false);
                }}
                className={`p-8 rounded-[32px] border-2 flex flex-col items-center gap-4 cursor-pointer transition-all ${
                    orderType === 'Dine-in' 
                    ? 'border-primary bg-bgCard shadow-lg shadow-primary/10' 
                    : 'border-borderColor/30 bg-bgCard/50 hover:border-primary/30'
                }`}
            >
                <div className={`p-4 rounded-full ${orderType === 'Dine-in' ? 'bg-primary text-bgMain shadow-lg' : 'bg-bgHeader text-textSecondary border border-borderColor/30'}`}>
                    <Utensils className="w-8 h-8" />
                </div>
                <span className={`font-bold uppercase tracking-[0.2em] text-xs ${orderType === 'Dine-in' ? 'text-primary' : 'text-textSecondary'}`}>Dine-in</span>
            </div>

            <div 
                onClick={() => setOrderType('Takeaway')}
                className={`p-8 rounded-[32px] border-2 flex flex-col items-center gap-4 cursor-pointer transition-all ${
                    orderType === 'Takeaway' 
                    ? 'border-primary bg-bgCard shadow-lg shadow-primary/10' 
                    : 'border-borderColor/30 bg-bgCard/50 hover:border-primary/30'
                }`}
            >
                <div className={`p-4 rounded-full ${orderType === 'Takeaway' ? 'bg-primary text-bgMain shadow-lg' : 'bg-bgHeader text-textSecondary border border-borderColor/30'}`}>
                    <ShoppingBag className="w-8 h-8" />
                </div>
                <span className={`font-bold uppercase tracking-[0.2em] text-xs ${orderType === 'Takeaway' ? 'text-primary' : 'text-textSecondary'}`}>Takeaway</span>
            </div>
        </div>

        {orderType === 'Dine-in' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 mb-12">
                <label className="block text-xs font-bold text-primary mb-3 uppercase tracking-[0.2em]">Table Number</label>
                <input 
                    type="number" 
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    placeholder="Enter table number (e.g. 5)" 
                    className="w-full p-5 rounded-2xl bg-bgCard border border-borderColor/30 text-white focus:outline-none focus:border-primary/50 text-lg placeholder-textSecondary"
                />
            </div>
        )}

        {orderType === 'Takeaway' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 mb-12 space-y-6">
                {/* Home Delivery Toggle */}
                <div 
                    onClick={() => setIsDelivery(!isDelivery)}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        isDelivery 
                        ? 'border-primary bg-bgCard shadow-lg shadow-primary/5' 
                        : 'border-borderColor/30 bg-bgCard/30 hover:border-primary/30'
                    }`}
                >
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDelivery ? 'bg-primary text-bgMain' : 'bg-bgHeader text-textSecondary'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                        </div>
                        <div>
                            <h3 className={`font-bold ${isDelivery ? 'text-primary' : 'text-textPrimary'}`}>Home Delivery</h3>
                            <p className="text-xs text-textSecondary">Address must be under 3 to 4 km to the resturant</p>
                        </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${isDelivery ? 'border-primary bg-primary' : 'border-textSecondary'}`}>
                        {isDelivery && <span className="text-bgMain font-bold">✓</span>}
                    </div>
                </div>

                {/* Address Input */}
                {isDelivery && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="block text-xs font-bold text-primary mb-3 uppercase tracking-[0.2em]">Delivery Address</label>
                        <textarea 
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                            placeholder="Enter full address (e.g. Flat 101, Tasty Street) " 
                            rows={3}
                            className="w-full p-5 rounded-2xl bg-bgCard border border-borderColor/30 text-white focus:outline-none focus:border-primary/50 text-base placeholder-textSecondary resize-none"
                        />
                    </div>
                )}
            </div>
        )}

        {/* Coupon Section */}
        <div className="mt-10 pt-10 border-t border-borderColor/30">
            <h3 className="text-sm font-bold text-primary mb-6 uppercase tracking-[0.2em]">Offers & Coupons</h3>
            
            <div className="mb-8">
                <CouponInput 
                    onApply={handleApplyCoupon} 
                    onRemove={removeCoupon}
                    appliedCoupon={coupon}
                    loading={loading}
                />
            </div>

            {!coupon && coupons.length > 0 && (
                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                    {coupons.map(c => (
                        <div key={c._id} className="min-w-[280px]">
                            <CouponCard coupon={c} onSelect={handleApplyCoupon} />
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Bill Finalization Card */}
        {cart.length > 0 && (
            <div className="mt-10 bg-bgModal rounded-[32px] p-8 border border-borderColor/30 mb-24 shadow-xl">
                <h3 className="font-serif font-bold text-primary text-xl uppercase tracking-widest mb-6 border-b border-borderColor/30 pb-4">Bill Finalization</h3>
                
                <div className="space-y-4 mb-6">
                    {cart.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-start text-sm border-b border-borderColor/10 pb-2 last:border-0">
                            <div className="text-textSecondary">
                                <span className="font-bold text-primary mr-2">{item.quantity}x</span>
                                <span className="text-textPrimary">{item.name}</span>
                            </div>
                            <div className="font-medium text-white">₹{item.price * item.quantity}</div>
                        </div>
                    ))}
                </div>

                <div className="space-y-3 pt-4 border-t border-borderColor/30">
                    <div className="flex justify-between text-sm text-textSecondary">
                        <span>Subtotal</span>
                        <span className="font-bold text-white">₹{getCartTotal().toFixed(2)}</span>
                    </div>
                    {coupon && (
                        <div className="flex justify-between text-green-400 font-bold text-sm">
                            <span>Coupon Discount ({coupon.code})</span>
                            <span>- ₹{coupon.discountAmount.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-textSecondary text-sm">
                        <span>Taxes & Charges</span>
                        <span className="font-bold text-white">₹40.00</span>
                    </div>
                    <div className="h-px bg-borderColor/30 my-2" />
                    <div className="flex justify-between text-xl font-bold font-serif text-primary uppercase tracking-tight">
                        <span>Grand Total</span>
                        <span>₹{getFinalTotal().toFixed(2)}</span>
                    </div>
                </div>
            </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-bgMain/95 backdrop-blur-xl border-t border-borderColor/30 p-6 z-20 shadow-2xl">
        <button 
            onClick={handlePlaceOrder}
            disabled={!orderType || (orderType === 'Dine-in' && !tableNumber) || (orderType === 'Takeaway' && isDelivery && !deliveryAddress.trim()) || loading}
            className={`w-full max-w-2xl mx-auto py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all uppercase tracking-widest ${
                !orderType || (orderType === 'Dine-in' && !tableNumber) || (orderType === 'Takeaway' && isDelivery && !deliveryAddress.trim()) || loading
                ? 'bg-bgCard text-textSecondary cursor-not-allowed border border-borderColor/30 opacity-50' 
                : 'bg-primary text-bgMain shadow-lg shadow-primary/10 hover:bg-primaryHover active:scale-[0.98]'
            }`}
        >
            {loading ? (
                <div className="w-5 h-5 border-2 border-bgMain border-t-transparent rounded-full animate-spin"></div>
            ) : (
                <>
                    <span>Confirm Order</span>
                    <PlayCircle className="w-5 h-5" />
                </>
            )}
        </button>
      </div>
    </div>
  );
};

export default OrderType;
