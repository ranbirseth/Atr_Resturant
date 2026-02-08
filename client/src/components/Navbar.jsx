import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { ShoppingBag, Search, Menu, X } from 'lucide-react';

const Navbar = ({ showSearch = false, searchTerm = '', setSearchTerm }) => {
  const { cart, categories, selectedCategory, setSelectedCategory } = useContext(AppContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const handleCategorySelect = (categoryName) => {
    setSelectedCategory(categoryName);
    setIsMenuOpen(false);
    navigate('/home');
  };

  return (
    <>
      <div className="sticky top-0 z-50 bg-bgMain/90 backdrop-blur-md border-b border-borderColor pb-2 shadow-lg shadow-black/20">
        <div className="flex items-center justify-between p-4 relative">
          {/* Hamburger Menu Icon */}
          <div className="cursor-pointer p-1" onClick={toggleMenu}>
            <Menu className="w-6 h-6 text-primary hover:text-primaryHover transition-colors" />
          </div>

          {/* Centered Logo */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <h1 className="text-xl md:text-3xl font-black text-primary tracking-tighter cursor-pointer font-serif flex flex-col items-center" onClick={() => navigate('/home')}>
              <span>Aatreyo</span>
              <span className="text-[8px] md:text-xs font-normal tracking-[0.2em] text-textMuted uppercase -mt-0.5 md:-mt-1">Royal Indian Cuisine</span>
            </h1>
          </div>

          {/* Cart Icon - Orange Background Style */}
          <div className="relative cursor-pointer" onClick={() => navigate('/cart')}>
            <div className="bg-primary p-2 md:p-2.5 rounded-full shadow-lg hover:bg-primaryHover transition-transform hover:-translate-y-0.5 active:translate-y-0">
              <ShoppingBag className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            {cartCount > 0 && (
              <div className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-bgCard shadow-sm">
                {cartCount}
              </div>
            )}
          </div>
        </div>

        {showSearch && (
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted w-5 h-5" />
              <input 
                type="text" 
                placeholder="Search for delicious food..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-bgSecondary pl-10 md:pl-12 pr-4 py-2.5 md:py-3 rounded-lg md:rounded-xl text-sm md:text-base focus:outline-none focus:ring-1 focus:ring-primary text-textPrimary placeholder-textDisabled border border-borderColor shadow-inner transition-all hover:border-primary/30"
              />
            </div>
          </div>
        )}
      </div>

      {/* Category Menu Popup */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop Blur Overlay */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-md transition-all duration-300"
            onClick={toggleMenu}
          ></div>

          {/* Popup Content */}
          <div className="relative bg-bgCard w-full max-w-sm rounded-[20px] p-8 shadow-2xl shadow-black/50 transform scale-100 transition-transform duration-300 overflow-hidden border border-borderColor">
            <button 
              onClick={toggleMenu}
              className="absolute top-5 right-5 p-2 rounded-full text-textMuted hover:text-primary hover:bg-bgHover transition-colors border border-transparent hover:border-borderColor"
            >
              <X size={24} />
            </button>

            <div className="mb-8 border-b border-borderColor pb-4">
              <h2 className="text-3xl font-serif font-black text-primary tracking-tight mb-1">Explore Menu</h2>
              <p className="text-textMuted font-medium text-sm">Select a category to view items</p>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              <button
                onClick={() => handleCategorySelect('All')}
                className={`w-full flex items-center justify-between p-4 rounded-xl transition-all duration-200 border ${
                  selectedCategory === 'All' 
                  ? 'bg-primary text-white border-primary shadow-lg font-bold' 
                  : 'bg-transparent border-borderColor text-textPrimary hover:bg-bgHover hover:border-primary'
                }`}
              >
                <span className="text-lg">All Key Items</span>
                {selectedCategory === 'All' && <div className="w-2 h-2 bg-white rounded-full"></div>}
              </button>

              {categories.map((cat) => (
                <button
                  key={cat._id}
                  onClick={() => handleCategorySelect(cat.name)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl transition-all duration-200 border ${
                    selectedCategory === cat.name 
                    ? 'bg-primary text-white border-primary shadow-lg font-bold' 
                    : 'bg-transparent border-borderColor text-textPrimary hover:bg-bgHover hover:border-primary'
                  }`}
                >
                  <span className="text-lg">{cat.name}</span>
                  {selectedCategory === cat.name && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </button>
              ))}
            </div>
            
            <div className="mt-8 pt-6 border-t border-borderColor flex justify-center">
              <p className="text-[10px] font-bold text-textDisabled tracking-[0.2em] uppercase">Aatreyo Royal Branding</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
