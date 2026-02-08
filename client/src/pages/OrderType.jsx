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
        tableNumber: orderType === 'Dine-in' ? tableNumber : undefined
    };

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
                onClick={() => setOrderType('Dine-in')}
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
            disabled={!orderType || (orderType === 'Dine-in' && !tableNumber) || loading}
            className={`w-full max-w-2xl mx-auto py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all uppercase tracking-widest ${
                !orderType || (orderType === 'Dine-in' && !tableNumber) || loading
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
