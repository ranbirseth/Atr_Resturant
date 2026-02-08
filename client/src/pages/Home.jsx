import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { ChevronRight } from 'lucide-react';
import FoodCard from '../components/FoodCard';

const Home = () => {
  const { menuItems, loading, selectedCategory, setSelectedCategory, categories, cart } = useContext(AppContext);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const filteredItems = menuItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen pb-20 bg-bgMain">
      {/* Premium Hero Header */}
      <div className="bg-bgHeader px-6 py-8 flex items-start justify-between">
        <div>
          {/* Logo Replacement */}
          {/* Logo & Text Layout */}
          <div className="flex items-center gap-3">
            <img 
              src="/home-logo.png" 
              alt="Aatreyo Restaurant" 
              className=" -mt-5 h-12 md:h-20 w-auto object-contain drop-shadow-lg scale-125 "
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <div className="flex flex-col">
              <h1 className="text-3xl md:text-4xl font-serif font-black text-primary tracking-wide leading-none">AATREYO</h1>
              <p className="text-textSecondary text-[10px] md:text-xs tracking-[0.3em] uppercase font-bold mt-1 ml-0.5">Restaurant</p>
            </div>
          </div>
        </div>
        
        <div 
          onClick={() => navigate('/cart')}
          className="relative cursor-pointer bg-primary px-6 py-2.5 rounded-lg flex items-center gap-2 hover:bg-primaryHover transition-colors shadow-lg"
        >
          <span className="text-bgMain font-bold text-sm">View Cart</span>
          <div className="bg-bgHeader text-primary text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-primary/30">
            {cart.reduce((acc, item) => acc + item.quantity, 0)}
          </div>
        </div>
      </div>

      <div className="px-6 -mt-6 max-w-7xl mx-auto">
        {/* Centered Search Bar */}
        <div className="max-w-xl mx-auto mb-10">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search for dishes..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 backdrop-blur-md pl-6 pr-4 py-4 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/50 text-textPrimary placeholder-textMuted border border-borderColor/50 shadow-2xl transition-all"
            />
          </div>
        </div>

        {/* Category Tabs (Chips) */}
        <div className="flex items-center gap-3 mb-12 overflow-x-auto pb-4 no-scrollbar">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-6 py-3 rounded-lg border-2 whitespace-nowrap transition-all font-bold text-sm ${
              selectedCategory === 'All'
              ? 'bg-primary border-primary text-bgMain shadow-lg shadow-primary/20'
              : 'bg-transparent border-borderColor text-textPrimary hover:border-primary/50'
            }`}
          >
            All Items
          </button>
          
          {categories.map((cat) => (
            <button
              key={cat._id}
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-6 py-3 rounded-lg border-2 whitespace-nowrap transition-all font-bold text-sm ${
                selectedCategory === cat.name
                ? 'bg-primary border-primary text-bgMain shadow-lg shadow-primary/20'
                : 'bg-transparent border-borderColor text-textPrimary hover:border-primary/50'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu Grid */}
        {loading ? (
            <div className="flex justify-center py-20">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="w-16 h-16 bg-bgCard border border-primary/30 rounded-full mb-4 shadow-lg shadow-primary/10"></div>
                </div>
            </div>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredItems.map(item => (
                    <FoodCard key={item._id} item={item} />
                ))}
                
                {filteredItems.length === 0 && (
                    <div className="col-span-full text-center py-20">
                        <p className="text-textMuted text-xl">No items found in this category.</p>
                    </div>
                )}
            </div>
        )}
      </div>

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <div className="fixed bottom-6 left-0 right-0 px-6 z-50 flex justify-center pointer-events-none">
            <button 
                onClick={() => navigate('/cart')}
                className="bg-primary text-bgMain px-8 py-4 rounded-full font-bold shadow-2xl shadow-primary/30 flex items-center gap-3 hover:bg-primaryHover active:scale-95 transition-all transform animate-in slide-in-from-bottom-4 pointer-events-auto"
            >
                <div className="bg-bgMain text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                    {cart.reduce((acc, item) => acc + item.quantity, 0)}
                </div>
                <span className="uppercase tracking-widest text-sm">View Cart</span>
                <ChevronRight size={18} />
            </button>
        </div>
      )}
    </div>
  );
};

export default Home;
