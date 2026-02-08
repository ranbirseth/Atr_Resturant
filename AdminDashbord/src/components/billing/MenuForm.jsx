import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';

const MenuForm = ({ item, onSubmit, onCancel, loading }) => {
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category: '',
    isAvailable: true
  });

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name,
        price: item.price,
        category: item.category,
        isAvailable: item.isAvailable
      });
    }
  }, [item]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      price: parseFloat(formData.price)
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">
            {item ? 'Edit Menu Item' : 'Add New Item'}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-200 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Item Name</label>
            <input
              required
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all text-sm font-medium"
              placeholder="e.g. Butter Chicken"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Price (₹)</label>
              <input
                required
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all text-sm font-medium"
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Category</label>
              <input
                required
                type="text"
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all text-sm font-medium"
                placeholder="e.g. Main Course"
              />
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl flex items-center justify-between border border-gray-100">
            <div>
              <span className="block font-bold text-gray-800 text-sm">Available</span>
              <span className="text-[10px] text-gray-500 italic">Toggle visibility in billing</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="isAvailable"
                checked={formData.isAvailable}
                onChange={handleChange}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-billing"></div>
            </label>
          </div>

          {item && (
            <div className="bg-orange-50 p-3 rounded-lg flex items-start gap-3 border border-orange-100">
              <AlertCircle size={18} className="text-orange-600 mt-0.5" />
              <p className="text-[10px] text-orange-800 leading-relaxed font-bold">
                Note: Changes to name or price will only apply to future bills. Past orders remain unchanged.
              </p>
            </div>
          )}

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-all text-sm"
            >
              Cancel
            </button>
            <button
              disabled={loading}
              type="submit"
              className="flex-1 relative group overflow-hidden rounded-xl shadow-lg shadow-orange-100 disabled:shadow-none"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-orange-600 group-hover:scale-105 transition-transform duration-300" />
              <div className="relative bg-orange-500 hover:bg-transparent text-white font-bold py-3 px-4 flex items-center justify-center gap-2 transition-all disabled:bg-gray-300">
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  <>
                    <Save size={18} className="group-hover:bounce transition-transform" />
                    {item ? 'Save Changes' : 'Add Item'}
                  </>
                )}
              </div>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MenuForm;
