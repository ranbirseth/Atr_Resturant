import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react';

const CustomizeOrder = () => {
  const navigate = useNavigate();
  const [addons, setAddons] = useState({
    extraCheese: false,
    extraSpicy: false,
    extraToppings: false
  });

  const toggleAddon = (key) => {
    setAddons(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleNext = () => {
    // Pass addons to next screen via state or just log them for now
    // In a real app we'd update context/cart
    navigate('/order-type', { state: { addons } });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="sticky top-0 bg-white/80 backdrop-blur-md p-4 flex items-center gap-4 border-b border-gray-100 z-10">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-6 h-6 text-gray-800" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Customize Order</h1>
      </div>

      <div className="p-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-4">
            <h2 className="font-bold text-lg mb-4">Add Extra Flavor?</h2>
            
            <div className="space-y-4">
                {[
                    { key: 'extraCheese', label: 'Extra Cheese', price: 30 },
                    { key: 'extraSpicy', label: 'Make it Extra Spicy', price: 0 },
                    { key: 'extraToppings', label: 'Extra Toppings', price: 50 },
                ].map((option) => (
                    <div 
                        key={option.key}
                        onClick={() => toggleAddon(option.key)}
                        className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                            addons[option.key] 
                            ? 'border-orange-500 bg-orange-50' 
                            : 'border-gray-200 hover:border-orange-200'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
                                addons[option.key] ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                            }`}>
                                {addons[option.key] && <Check className="w-4 h-4 text-white" />}
                            </div>
                            <div>
                                <p className="font-bold text-gray-800">{option.label}</p>
                                {option.price > 0 && <p className="text-sm text-gray-500">+₹{option.price}</p>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 p-4 z-20">
        <button 
            onClick={handleNext}
            className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-gray-300 flex items-center justify-center gap-2 hover:bg-black active:scale-95 transition-all"
        >
            <span>Select Dining Option</span>
            <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default CustomizeOrder;
