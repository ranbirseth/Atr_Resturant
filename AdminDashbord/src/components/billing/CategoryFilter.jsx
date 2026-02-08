import React from 'react';
import { Layers } from 'lucide-react';

const CategoryFilter = ({ categories, activeCategory, onCategoryChange }) => {
  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm font-sans">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="text-primary-billing" size={18} />
          <h2 className="text-lg font-black text-gray-800 tracking-tight">Sections</h2>
        </div>
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Filter Menu</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <button
          onClick={() => onCategoryChange(null)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 font-bold text-sm relative group overflow-hidden ${
            activeCategory === null 
            ? 'bg-orange-500 text-white shadow-lg shadow-orange-100' 
            : 'text-gray-500 hover:bg-orange-50 hover:text-orange-600 hover:pl-6'
          }`}
        >
          {activeCategory === null && (
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-white rounded-r-full" />
          )}
          <div className={`w-2 h-2 rounded-full transition-all duration-300 ${activeCategory === null ? 'bg-white scale-125' : 'bg-gray-200 group-hover:bg-orange-400 group-hover:scale-125'}`} />
          All Items
        </button>

        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 font-bold text-sm text-left relative group overflow-hidden ${
              activeCategory === cat 
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-100' 
              : 'text-gray-500 hover:bg-orange-50 hover:text-orange-600 hover:pl-6'
            }`}
          >
             {activeCategory === cat && (
               <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-white rounded-r-full" />
             )}
             <div className={`w-2 h-2 rounded-full transition-all duration-300 ${activeCategory === cat ? 'bg-white scale-125' : 'bg-gray-200 group-hover:bg-orange-400 group-hover:scale-125'}`} />
             {cat}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CategoryFilter;
