import React, { useContext, useState, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import UpsellModal from './UpsellModal';
import { findUpsellItem } from '../utils/upsellHelper';

const FoodCard = ({ item }) => {
  const { addToCart, menuItems } = useContext(AppContext);
  const navigate = useNavigate();
  const [showUpsell, setShowUpsell] = useState(false);
  const [targetUpsell, setTargetUpsell] = useState(null);

  const handleAddKey = (e) => {
    e.stopPropagation();
    
    const excludedCategories = ['BEVERAGE', 'DESSERT', 'ICE CREAM', 'ROLLS']; 
    const itemCat = item.category.toUpperCase();

    if (!excludedCategories.includes(itemCat)) {
        // Try to find upsell
        const upsell = findUpsellItem(item, menuItems);
        if (upsell) {
            setTargetUpsell(upsell);
            setShowUpsell(true);
        } else {
            addToCart(item);
        }
    } else {
      addToCart(item);
    }
  };

  const handleUpsellClose = useCallback(() => {
    setShowUpsell(false);
    addToCart(item);
  }, [addToCart, item]);

  const handleAddUpsellItem = (upsellItem) => {
    addToCart(upsellItem); // Add the upsell item
    addToCart(item);       // Add the original item
    setShowUpsell(false);  // Close modal
  };

  return (
    <>
      {showUpsell && targetUpsell && (
        <UpsellModal 
          onClose={handleUpsellClose} 
          onAddItem={handleAddUpsellItem}
          upsellItem={targetUpsell}
        />
      )}
      <div 
        onClick={() => navigate(`/food/${item._id}`)}
        className="bg-bgCard rounded-3xl border border-borderColor/30 overflow-hidden cursor-pointer hover:border-primary/50 transition-all duration-300 group relative"
      >
        {/* Centered Food Image/Emoji Area */}
        {/* Full Image Area */}
        <div className="h-48 w-full overflow-hidden">
          <img 
            src={item.image} 
            alt={item.name} 
            className={`w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500 ${!item.available ? 'grayscale opacity-60' : ''}`}
          />
        </div>
        
        {/* Content Area */}
        <div className="p-6 pt-2">
          {/* Title and Price Row */}
          <div className="flex items-center justify-between gap-4 mb-2">
            <h3 className="font-serif font-bold text-textPrimary text-xl tracking-tight line-clamp-1">{item.name}</h3>
            <div className="bg-primary px-3 py-1 rounded-lg">
              <span className="text-bgMain font-bold text-sm whitespace-nowrap">₹{item.price}</span>
            </div>
          </div>
          
          {/* Description */}
          <p className="text-textSecondary text-xs line-clamp-2 min-h-[32px] mb-6 leading-relaxed">
            {item.description}
          </p>

          {/* Full-width Add to Cart Button */}
          <button 
            onClick={handleAddKey}
            disabled={!item.available}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${
              item.available 
                ? 'bg-primary text-bgMain hover:bg-primaryHover shadow-lg shadow-primary/10 active:scale-[0.98]' 
                : 'bg-borderColor text-textDisabled cursor-not-allowed'
            }`}
          >
            {item.available ? 'Add to Cart' : 'Sold Out'}
          </button>
        </div>
      </div>
    </>
  );
};

export default FoodCard;
