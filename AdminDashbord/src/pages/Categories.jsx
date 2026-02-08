import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, Eye, EyeOff } from 'lucide-react';
import Card, { CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table, { TableRow, TableCell } from '../components/ui/Table';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../services/categoryService';
import { getItems } from '../services/itemService';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [name, setName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catsData, itemsData] = await Promise.all([
        getCategories(),
        getItems()
      ]);
      setCategories(catsData);
      setItems(itemsData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryItemCount = (categoryName) => {
    return items.filter(item => item.category === categoryName).length;
  };

  const handleEdit = (cat) => {
    setEditingCategory(cat);
    setName(cat.name);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingCategory) {
        const updated = await updateCategory(editingCategory._id, { name });
        setCategories(categories.map(c => c._id === updated._id ? updated : c));
      } else {
        const created = await createCategory({ name, isVisible: true });
        setCategories([...categories, created]);
      }
      setIsModalOpen(false);
      setName('');
      setEditingCategory(null);
    } catch (error) {
        alert(error.response?.data?.message || 'Failed to save category');
    }
  };

  const toggleVisibility = async (cat) => {
    try {
        const updated = await updateCategory(cat._id, { isVisible: !cat.isVisible });
        setCategories(categories.map(c => c._id === updated._id ? updated : c));
    } catch (error) {
        alert('Failed to update visibility');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete category? This might affect existing items.')) {
        try {
            await deleteCategory(id);
            setCategories(categories.filter(c => c._id !== id));
        } catch (error) {
            alert('Failed to delete category');
        }
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading categories...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Categories</h1>
          <p className="text-textMuted text-sm mt-1">Organize your menu into logical sections.</p>
        </div>
        <Button onClick={() => { setEditingCategory(null); setName(''); setIsModalOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Category
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table headers={['Category Name', 'Items Count', 'Visibility', 'Actions']}>
            {categories.map((cat) => (
              <TableRow key={cat._id}>
                <TableCell className="font-bold text-textPrimary">{cat.name}</TableCell>
                <TableCell>{getCategoryItemCount(cat.name)} items</TableCell>
                <TableCell>
                  <Badge variant={cat.isVisible ? 'green' : 'gray'}>
                    {cat.isVisible ? 'Visible' : 'Hidden'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(cat)}>
                      <Edit2 size={16} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleVisibility(cat)}>
                      {cat.isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(cat._id)}>
                      <Trash2 size={16} className="text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {categories.length === 0 && (
                <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-textMuted">
                        No categories found. Add one to get started.
                    </TableCell>
                </TableRow>
            )}
          </Table>
        </CardContent>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCategory ? 'Edit Category' : 'Add Category'}
        footer={
          <div className="flex space-x-3 w-full">
            <Button variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave}>Save</Button>
          </div>
        }
      >
        <Input 
          label="Category Name" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="e.g. Italian Specials"
        />
      </Modal>
    </div>
  );
}
