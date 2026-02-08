import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { ArrowLeft, Trash2, ChevronRight, ShoppingBag } from 'lucide-react';


const Cart = () => {
    const { cart, removeFromCart, getCartTotal } = useContext(AppContext);
    const navigate = useNavigate();

    const [loading, setLoading] = React.useState(false);

    const handleCheckout = () => {
        setLoading(true);
        // Simulate navigation or checkout process
        setTimeout(() => {
            navigate('/order-type'); // Or success page

        }, 1000);
    };

    if (cart.length === 0) {
        return (
            <div className="min-h-screen bg-bgMain flex flex-col items-center justify-center p-4">
                <div className="w-24 h-24 bg-bgCard rounded-full flex items-center justify-center mb-6 border border-borderColor/30 shadow-2xl">
                    <ShoppingBag className="w-10 h-10 text-primary/50" />
                </div>
                <h2 className="text-3xl font-bold text-primary mb-3 font-serif uppercase tracking-tight">Your Cart is Empty</h2>
                <p className="text-textSecondary text-center mb-10 max-w-xs leading-relaxed">Your royal feast awaits. Browse our menu to add exquisite dishes.</p>
                <button 
                    onClick={() => navigate('/home')}
                    className="bg-primary text-bgMain px-10 py-4 rounded-xl font-bold uppercase tracking-wider shadow-lg shadow-primary/10 hover:bg-primaryHover transition-all"
                >
                    Explore Menu
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-bgMain pb-32">
            <div className="sticky top-0 bg-bgHeader p-6 flex items-center gap-4 border-b border-borderColor/30 z-20 shadow-lg">
                <button onClick={() => navigate(-1)} className="text-textSecondary hover:text-primary transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="text-2xl font-bold text-primary font-serif tracking-wide uppercase">My Royal Cart</h1>
            </div>

            <div className="p-6 space-y-4 max-w-2xl mx-auto">
                {cart.map((item, index) => (
                    <div key={index} className="bg-bgCard p-5 rounded-2xl border border-borderColor/30 flex gap-5 group hover:border-primary/50 transition-all">
                        <img src={item.image} alt={item.name} className="w-24 h-24 object-cover rounded-xl" />
                        <div className="flex-1 flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-textPrimary font-serif text-lg tracking-tight uppercase">{item.name}</h3>
                                    <button onClick={() => removeFromCart(index)} className="text-textSecondary hover:text-red-500 transition-colors">
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                                <p className="text-sm text-textSecondary mb-2">
                                    <span className="font-bold text-primary">{item.quantity}</span> x ₹{item.price}
                                </p>
                            </div>
                            
                            <div className="flex items-end justify-between">
                                <div className="font-bold text-primary text-xl">₹{item.price * item.quantity}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Bill Details */}
            <div className="px-6 mt-8 max-w-2xl mx-auto mb-10">
                <div className="bg-bgModal p-8 rounded-[32px] border border-borderColor/30 shadow-xl">
                    <h3 className="font-bold text-primary mb-6 text-xs uppercase tracking-[0.2em] border-b border-borderColor/30 pb-4">Bill Summary</h3>
                    <div className="space-y-4">
                        <div className="flex justify-between text-sm text-textSecondary">
                            <span>Item Total</span>
                            <span className="font-bold text-white">₹{getCartTotal()}</span>
                        </div>
                        <div className="flex justify-between text-sm text-textSecondary">
                            <span>Taxes & Charges</span>
                            <span className="font-bold text-white">₹40</span>
                        </div>
                        <div className="h-px bg-borderColor/30 my-4" />
                        <div className="flex justify-between font-bold text-primary text-2xl font-serif uppercase tracking-tight">
                            <span>To Pay</span>
                            <span>₹{getCartTotal() + 40}</span>
                        </div>
                    </div>
                </div>

                {/* Proceed to Checkout Button - Inline */}
                <button 
                    onClick={handleCheckout}
                    disabled={loading}
                    className="w-full mt-6 bg-primary text-bgMain py-5 rounded-xl font-bold text-base shadow-xl shadow-primary/20 flex items-center justify-center gap-2 hover:bg-primaryHover active:scale-[0.98] transition-all disabled:opacity-50 uppercase tracking-widest"
                >
                    {loading ? (
                        <div className="w-5 h-5 border-2 border-bgMain border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <>
                            <span>Proceed to Checkout</span>
                            <ChevronRight className="w-5 h-5" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default Cart;
