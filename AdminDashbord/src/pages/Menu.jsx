import React, { useState, useRef } from 'react';
import { SOCKET_URL } from '../config';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Image as ImageIcon,
  ChevronRight,
  Filter,
  Check,
  X,
  Link,
  Upload
} from 'lucide-react';
import Card, { CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { getCategories } from '../services/categoryService';
import { getItems, createItem, updateItem, deleteItem } from '../services/itemService';

export default function Menu() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [categoryList, setCategoryList] = useState([]);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    description: '',
    isVeg: true,
    available: true,
    image: null
  });

  const [imageMode, setImageMode] = useState('upload'); // 'upload' | 'url'
  const fileInputRef = useRef(null);

  const getImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (typeof imagePath === 'string' && imagePath.startsWith('http')) return imagePath;
    if (typeof imagePath === 'string') return `${SOCKET_URL}${imagePath}`;
    if (imagePath instanceof File) return URL.createObjectURL(imagePath);
    return null;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData({ ...formData, image: file });
    }
  };

  React.useEffect(() => {
    fetchItems();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await getCategories();
      setCategoryList(data);
      if (data.length > 0) {
        setFormData(prev => ({ ...prev, category: data[0].name }));
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const fetchItems = async () => {
    try {
      setLoading(true);
      const data = await getItems();
      setItems(data);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOptions = ['All', ...categoryList.filter(c => c.isVisible).map(c => c.name)];

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({ ...item });
    // Determine image mode based on existing image
    if (item.image && typeof item.image === 'string' && item.image.startsWith('http')) {
      setImageMode('url');
    } else {
      setImageMode('upload');
    }
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteItem(id);
        setItems(items.filter(item => item._id !== id));
      } catch (error) {
        alert('Failed to delete item');
      }
    }
  };

  const handleToggleAvailability = async (item) => {
    try {
      const updated = await updateItem(item._id, { ...item, available: !item.available });
      setItems(items.map(i => i._id === item._id ? updated : i));
    } catch (error) {
      alert('Failed to update availability');
    }
  };

  const handleSave = async () => {
    try {
      const data = new FormData();
      Object.keys(formData).forEach(key => {
        if (key === 'image') {
           if (formData[key]) data.append(key, formData[key]);
        } else {
           data.append(key, formData[key]);
        }
      });

      if (editingItem) {
        const updated = await updateItem(editingItem._id, data);
        setItems(items.map(item => item._id === editingItem._id ? updated : item));
      } else {
        const created = await createItem(data);
        setItems([...items, created]);
      }
      setIsModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      alert('Failed to save item');
      console.error(error);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      category: categoryList.length > 0 ? categoryList[0].name : '',
      price: '',
      description: '',
      isVeg: true,
      available: true,
      image: null
    });
    setImageMode('upload');
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Menu Management</h1>
          <p className="text-textMuted text-sm mt-1">Add, edit or remove food items from your menu.</p>
        </div>
        <Button onClick={openAddModal} className="w-full sm:w-auto">
          <Plus className="w-4 h-4 mr-2" />
          Add New Item
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textDisabled w-4 h-4" />
          <input
            type="text"
            placeholder="Search food items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-bgMain border border-borderColor rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-textPrimary placeholder-textDisabled"
          />
        </div>
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 md:pb-0">
          {filterOptions.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-2 text-sm font-medium rounded-xl whitespace-nowrap transition-all ${
                categoryFilter === cat 
                  ? 'bg-primary text-white border border-primary' 
                  : 'bg-bgCard text-textSecondary border border-borderColor hover:bg-bgHover'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
           <div className="col-span-full py-20 text-center text-textMuted">Loading menu...</div>
        ) : filteredItems.length === 0 ? (
           <div className="col-span-full py-20 text-center text-textMuted">No items found.</div>
        ) : filteredItems.map((item) => (
          <Card key={item._id} className="overflow-hidden group">
            <div className="aspect-video bg-bgSecondary relative">
              {item.image ? (
                <img src={getImageUrl(item.image)} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-textDisabled">
                  <ImageIcon size={40} strokeWidth={1} />
                  <p className="text-xs mt-2">No image available</p>
                </div>
              )}
              <div className="absolute top-3 left-3 flex space-x-2">
                <Badge variant={item.isVeg ? 'green' : 'red'}>
                  {item.isVeg ? 'Veg' : 'Non-Veg'}
                </Badge>
                {!item.available && (
                   <Badge variant="amber">Unavailable</Badge>
                )}
              </div>
            </div>
            <CardContent className="p-5">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-textPrimary">{item.name}</h3>
                <span className="text-lg font-bold text-primary">₹{item.price}</span>
              </div>
              <p className="text-sm text-textMuted line-clamp-2 mb-4 h-10">{item.description}</p>
              
              <div className="flex items-center justify-between pt-4 border-t border-borderColor">
                <div className="flex space-x-2">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                    <Edit2 size={16} className="text-textSecondary hover:text-primary" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item._id)}>
                    <Trash2 size={16} className="text-red-500 hover:text-red-600" />
                  </Button>
                </div>
                <div className="flex items-center space-x-2">
                   <span className="text-xs text-textMuted font-medium">Availability</span>
                   <button 
                    onClick={() => handleToggleAvailability(item)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${item.available ? 'bg-green-500' : 'bg-textDisabled'}`}
                   >
                     <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${item.available ? 'left-6' : 'left-1'}`} />
                   </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
        footer={
          <div className="flex space-x-3 w-full">
            <Button variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave}>Save Item</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center space-x-4 bg-bgSecondary p-1 rounded-xl border border-borderColor">
             {/* <button
               className={`flex-1 flex items-center justify-center space-x-2 py-2 text-sm font-medium rounded-lg transition-all ${imageMode === 'upload' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               onClick={() => setImageMode('upload')}
             >
               <Upload size={16} />
               <span>Upload Image</span>
             </button> */}
             <button
               className={`flex-1 flex items-center justify-center space-x-2 py-2 text-sm font-medium rounded-lg transition-all ${imageMode === 'url' ? 'bg-bgCard text-textPrimary shadow-sm border border-borderColor' : 'text-textMuted hover:text-textPrimary'}`}
               onClick={() => setImageMode('url')}
             >
               <Link size={16} />
               <span>Image URL</span>
             </button>
          </div>

          {imageMode === 'upload' ? (
             <div 
               className="flex flex-col items-center justify-center border-2 border-dashed border-borderColor rounded-2xl p-8 hover:border-primary/50 transition-colors cursor-pointer bg-bgSecondary relative overflow-hidden"
               onClick={() => fileInputRef.current.click()}
             >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileChange} 
                  accept="image/*"
                />
                {formData.image && typeof formData.image !== 'string' ? (
                  <img src={getImageUrl(formData.image)} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <>
                    <ImageIcon size={32} className="text-textDisabled mb-2" />
                    <p className="text-sm font-medium text-textSecondary">Click to upload product image</p>
                    <p className="text-xs text-textDisabled mt-1">Max size 2MB, JPG/PNG</p>
                  </>
                )}
             </div>
          ) : (
            <div>
               <Input
                 label="Image URL"
                 placeholder="https://example.com/image.jpg"
                 value={typeof formData.image === 'string' ? formData.image : ''}
                 onChange={(e) => setFormData({ ...formData, image: e.target.value })}
               />
               <div className="mt-2 aspect-video bg-bgSecondary rounded-xl overflow-hidden flex items-center justify-center border border-borderColor">
                  {typeof formData.image === 'string' && formData.image ? (
                     <img src={formData.image} alt="Preview" className="w-full h-full object-cover" onError={(e) => e.target.style.display = 'none'} />
                  ) : (
                     <div className="flex flex-col items-center text-textDisabled">
                        <ImageIcon size={24} />
                        <span className="text-xs mt-1">Preview</span>
                     </div>
                  )}
               </div>
            </div>
          )}

          <Input 
            label="Item Name" 
            placeholder="e.g. Butter Chicken" 
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
          />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-textSecondary">Category</label>
              <select 
                className="w-full px-4 py-2.5 bg-bgCard border border-borderColor rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-textPrimary"
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
              >
                {categoryList.map(c => <option key={c._id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <Input 
              label="Price (₹)" 
              type="number" 
              placeholder="0.00" 
              value={formData.price}
              onChange={(e) => setFormData({...formData, price: e.target.value})}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-textSecondary">Description</label>
            <textarea 
              className="w-full px-4 py-2.5 bg-bgCard border border-borderColor rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-h-[100px] text-textPrimary placeholder-textDisabled"
              placeholder="Describe the dish..."
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-bgSecondary rounded-xl border border-borderColor">
             <div className="flex items-center space-x-3">
                <button 
                  onClick={() => setFormData({...formData, isVeg: true})}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${formData.isVeg ? 'bg-green-600 border-green-600 text-white' : 'border-textDisabled/50'}`}
                >
                  {formData.isVeg && <Check size={14} strokeWidth={4} />}
                </button>
                <span className="text-sm font-medium text-textSecondary">Vegetarian</span>
             </div>
             <div className="flex items-center space-x-3">
                <button 
                  onClick={() => setFormData({...formData, isVeg: false})}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${!formData.isVeg ? 'bg-red-600 border-red-600 text-white' : 'border-textDisabled/50'}`}
                >
                  {!formData.isVeg && <Check size={14} strokeWidth={4} />}
                </button>
                <span className="text-sm font-medium text-textSecondary">Non-Veg</span>
             </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
