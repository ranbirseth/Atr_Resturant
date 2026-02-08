import React, { useState, useEffect } from 'react';
import { getMenuItems, createMenuItem, updateMenuItem, toggleMenuItem, deleteMenuItem } from '../../services/billingService';
import { Plus, Edit2, Trash2, Search, Filter, CheckCircle, XCircle, Utensils } from 'lucide-react';
import MenuForm from './MenuForm';
import CategoryFilter from './CategoryFilter';

const MenuList = () => {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [activeCategory]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const { data } = await getMenuItems(activeCategory);
      setItems(data);
      
      // Extract unique categories for the filter sidebar
      if (!activeCategory) {
          const cats = [...new Set(data.map(item => item.category))];
          setCategories(cats);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (itemData) => {
    try {
      setLoading(true);
      await createMenuItem(itemData);
      setShowForm(false);
      fetchItems();
    } catch (error) {
      alert('Error creating item: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (itemData) => {
    try {
      setLoading(true);
      await updateMenuItem(editingItem._id, itemData);
      setShowForm(false);
      setEditingItem(null);
      fetchItems();
    } catch (error) {
      alert('Error updating item: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      await toggleMenuItem(id);
      setItems(items.map(i => i._id === id ? { ...i, isAvailable: !i.isAvailable } : i));
    } catch (error) {
      console.error('Error toggling item:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this item? It will be hidden but preserved in order history.')) return;
    try {
      await deleteMenuItem(id);
      setItems(items.filter(i => i._id !== id));
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full bg-gray-50 overflow-hidden font-sans">
      <CategoryFilter 
        categories={categories} 
        activeCategory={activeCategory} 
        onCategoryChange={setActiveCategory} 
      />

      <div className="flex-1 flex flex-col p-8 overflow-hidden">
        <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-sans">
          <div>
            <h1 className="text-3xl font-black text-gray-800 tracking-tight">Menu Management</h1>
            <p className="text-gray-500 font-medium">Add, edit or update your restaurant menu items</p>
          </div>
          <button 
            onClick={() => setShowForm(true)}
            className="relative group overflow-hidden rounded-xl shadow-lg shadow-orange-100"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-orange-600 group-hover:scale-105 transition-transform duration-300" />
            <div className="relative px-6 py-4 flex items-center gap-2 text-white font-black">
              <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
              ADD NEW ITEM
            </div>
          </button>
        </div>

        <div className="flex-1 bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col overflow-hidden text-sans">
          {/* Header Actions */}
          <div className="p-6 border-b border-gray-100 flex gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary-billing transition-colors" size={20} />
              <input 
                type="text" 
                placeholder="Search menu items..." 
                className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border border-transparent focus:border-orange-500 focus:ring-4 focus:ring-orange-100 focus:bg-white transition-all outline-none font-medium text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 px-6 bg-gray-50 rounded-2xl border border-transparent">
              <Filter size={18} className="text-gray-400" />
              <span className="text-gray-600 font-bold text-sm tracking-tight">{filteredItems.length} ITEMS FOUND</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="p-10 text-center text-gray-400 font-medium">Loading items...</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-20 text-center">
                <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                  <Utensils size={32} className="text-gray-200" />
                </div>
                <p className="text-gray-400 font-bold">No menu items found</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-gray-50/90 backdrop-blur-md z-10">
                  <tr>
                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Item Name</th>
                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Category</th>
                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Price</th>
                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">Status</th>
                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredItems.map(item => (
                    <tr key={item._id} className="hover:bg-orange-50/30 transition-all group relative">
                      <td className="px-8 py-6 relative">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 scale-y-0 group-hover:scale-y-100 transition-transform origin-center" />
                        <span className="font-bold text-gray-800 text-lg group-hover:text-orange-700 transition-colors uppercase tracking-tight">{item.name}</span>
                      </td>
                      <td className="px-8 py-6">
                        <span className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider group-hover:bg-orange-100 group-hover:text-orange-600 transition-colors">{item.category}</span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <span className="font-black text-gray-900 text-lg group-hover:scale-110 transition-transform inline-block">₹{item.price}</span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex justify-center">
                          <button 
                            onClick={() => handleToggle(item._id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                              item.isAvailable 
                              ? 'bg-green-50 text-green-600 border-green-100 hover:bg-green-500 hover:text-white hover:shadow-lg hover:shadow-green-100' 
                              : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-500 hover:text-white hover:shadow-lg hover:shadow-red-100'
                            }`}
                          >
                            {item.isAvailable ? (
                              <><CheckCircle size={14} /> Available</>
                            ) : (
                              <><XCircle size={14} /> Out of Stock</>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex justify-center gap-3">
                          <button 
                            onClick={() => { setEditingItem(item); setShowForm(true); }}
                            className="p-3 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm shadow-blue-50 border border-blue-100 hover:-translate-y-1 active:translate-y-0"
                            title="Edit"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => handleDelete(item._id)}
                            className="p-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm shadow-red-50 border border-red-100 hover:-translate-y-1 active:translate-y-0"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <MenuForm 
          item={editingItem}
          onSubmit={editingItem ? handleUpdate : handleCreate}
          onCancel={() => { setShowForm(false); setEditingItem(null); }}
          loading={loading}
        />
      )}
    </div>
  );
};

export default MenuList;
