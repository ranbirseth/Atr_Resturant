import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import UpsellModal from '../components/UpsellModal';
import { ArrowLeft, Star, Clock, Minus, Plus } from 'lucide-react';
import { findUpsellItem } from '../utils/upsellHelper';

const FoodDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { menuItems, addToCart } = useContext(AppContext);
    const [item, setItem] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [showUpsell, setShowUpsell] = useState(false);
    const [targetUpsell, setTargetUpsell] = useState(null);

    useEffect(() => {
        const found = menuItems.find(i => i._id === id);
        if (found) setItem(found);
    }, [id, menuItems]);

    if (!item) return <div className="p-10 text-center text-primary animate-pulse">Loading Royal Delicacy...</div>;

    const handleAddToCart = () => {
        const excludedCategories = ['BEVERAGE', 'DESSERT', 'ICE CREAM', 'ROLLS']; 
        if (!excludedCategories.includes(item.category.toUpperCase())) {
             const upsell = findUpsellItem(item, menuItems);
             if (upsell) {
                setTargetUpsell(upsell);
                setShowUpsell(true);
             } else {
                addToCart(item, quantity);
                navigate('/cart');
             }
        } else {
            addToCart(item, quantity);
            navigate('/cart');
        }
    };

    const handleUpsellClose = () => {
        setShowUpsell(false);
        addToCart(item, quantity);
        navigate('/cart');
    };
    
    const handleAddUpsellItem = (upsellItem) => {
        addToCart(upsellItem); // Add the upsell item (qty 1 usually)
        addToCart(item, quantity);     // Add the original item with selected quantity
        setShowUpsell(false);
        navigate('/cart');
    };

    return (
        <div className="min-h-screen bg-bgMain text-textPrimary">
             {showUpsell && targetUpsell && (
                <UpsellModal 
                  onClose={handleUpsellClose} 
                  onAddItem={handleAddUpsellItem}
                  upsellItem={targetUpsell}
                />
             )}
             
             <div className="max-w-xl mx-auto pt-20 px-6">
                <div className="bg-bgModal rounded-3xl p-8 border border-borderColor/50 shadow-2xl relative overflow-hidden">
                    {/* Floating Back Button */}
                    <button 
                        onClick={() => navigate(-1)}
                        className="absolute top-4 left-4 text-textSecondary hover:text-primary transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>

                    <div className="text-center mt-4">
                        <img src={item.image} alt={item.name} className="w-full h-64 object-cover rounded-2xl mb-6 shadow-lg" />
                        
                        <h1 className="text-3xl font-serif font-bold text-primary tracking-tight mb-2 uppercase">{item.name}</h1>
                        <p className="text-2xl font-bold text-white mb-8">₹{item.price}</p>
                        
                        <p className="text-textSecondary text-sm leading-relaxed mb-10 max-w-sm mx-auto">
                            {item.description}
                        </p>

                        {/* Quantity Selector - Modal Style */}
                        <div className="flex items-center justify-center gap-8 mb-12">
                            <button 
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                className="w-12 h-12 rounded-full bg-[#5C321C] flex items-center justify-center text-primary hover:bg-[#724128] transition-colors"
                            >
                                <Minus size={24} strokeWidth={3} />
                            </button>
                            <span className="text-4xl font-bold text-primary w-10 text-center">{quantity}</span>
                            <button 
                                onClick={() => setQuantity(quantity + 1)}
                                className="w-12 h-12 rounded-full bg-[#5C321C] flex items-center justify-center text-primary hover:bg-[#724128] transition-colors"
                            >
                                <Plus size={24} strokeWidth={3} />
                            </button>
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => navigate(-1)}
                                className="py-4 rounded-xl border-2 border-[#3D251E] text-white font-bold text-sm tracking-wide hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleAddToCart}
                                className="py-4 rounded-xl bg-primary text-bgMain font-bold text-sm tracking-wide hover:bg-primaryHover transition-colors shadow-lg shadow-primary/10"
                            >
                                Add to Cart
                            </button>
                        </div>
                    </div>
                </div>
             </div>
        </div>
    );
};

export default FoodDetails;
