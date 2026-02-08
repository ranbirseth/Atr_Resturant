import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Ticket, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import Card, { CardContent } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table, { TableRow, TableCell } from '../components/ui/Table';
import BASE_API_URL from '../config';

const API_URL = `${BASE_API_URL}/coupons`;

export default function Coupons() {
  const [coupons, setCoupons] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    code: '',
    type: 'PERCENT',
    value: '',
    minOrder: ''
  });

  // Fetch coupons on component mount
  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/all`);
      const data = await response.json();
      setCoupons(data);
      setError('');
    } catch (err) {
      console.error('Error fetching coupons:', err);
      setError('Failed to load coupons');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!formData.code || !formData.value || !formData.minOrder) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setIsSaving(true);
      setError('');

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code,
          discountType: formData.type,
          value: parseFloat(formData.value),
          minOrderAmount: parseFloat(formData.minOrder)
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create coupon');
      }

      // Add new coupon to list
      setCoupons([data, ...coupons]);
      
      // Reset form and close modal
      setFormData({ code: '', type: 'PERCENT', value: '', minOrder: '' });
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error creating coupon:', err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update coupon');
      }

      // Update coupon in list
      setCoupons(coupons.map(c => c._id === id ? data : c));
    } catch (err) {
      console.error('Error updating coupon:', err);
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this coupon?')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete coupon');
      }

      // Remove coupon from list
      setCoupons(coupons.filter(c => c._id !== id));
    } catch (err) {
      console.error('Error deleting coupon:', err);
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Coupons Management</h1>
          <p className="text-textMuted text-sm mt-1">Create and manage discount offers for customers.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Coupon
        </Button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : coupons.length === 0 ? (
            <div className="text-center py-12 text-textMuted">
              <Ticket className="w-12 h-12 mx-auto mb-3 text-textDisabled" />
              <p>No coupons yet. Create your first coupon!</p>
            </div>
          ) : (
            <Table headers={['Coupon Code', 'Discount', 'Min. Order', 'Status', 'Actions']}>
              {coupons.map((coupon) => (
                <TableRow key={coupon._id}>
                  <TableCell>
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-lg bg-red-900/20 text-red-500 flex items-center justify-center mr-3">
                        <Ticket size={16} />
                      </div>
                      <span className="font-bold text-textPrimary tracking-wider">{coupon.code}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-textSecondary">
                      {coupon.discountType === 'PERCENT' ? `${coupon.value}% OFF` : `₹${coupon.value} OFF`}
                    </span>
                  </TableCell>
                  <TableCell>₹{coupon.minOrderAmount}</TableCell>
                  <TableCell>
                    <Badge variant={coupon.isActive ? 'green' : 'gray'}>
                      {coupon.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => toggleStatus(coupon._id, coupon.isActive)}
                        title={coupon.isActive ? 'Disable coupon' : 'Enable coupon'}
                      >
                        {coupon.isActive ? 
                          <XCircle size={18} className="text-textMuted hover:text-white" /> : 
                          <CheckCircle2 size={18} className="text-green-500" />
                        }
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDelete(coupon._id)}
                        title="Delete coupon"
                      >
                        <Trash2 size={18} className="text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setError('');
          setFormData({ code: '', type: 'PERCENT', value: '', minOrder: '' });
        }}
        title="Create New Coupon"
        footer={
          <div className="flex space-x-3 w-full">
            <Button 
              variant="secondary" 
              className="flex-1" 
              onClick={() => {
                setIsModalOpen(false);
                setError('');
                setFormData({ code: '', type: 'PERCENT', value: '', minOrder: '' });
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1" 
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Coupon'
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <Input 
            label="Coupon Code" 
            placeholder="e.g. SAVE30" 
            value={formData.code} 
            onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-textSecondary">Type</label>
              <select 
                className="w-full px-4 py-2.5 bg-bgMain border border-borderColor rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-textPrimary"
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value})}
              >
                <option value="PERCENT">Percentage (%)</option>
                <option value="FLAT">Flat Amount (₹)</option>
              </select>
            </div>
            <Input 
              label="Value" 
              type="number" 
              placeholder="e.g. 20" 
              value={formData.value}
              onChange={e => setFormData({...formData, value: e.target.value})}
            />
          </div>
          <Input 
            label="Min Order Value (₹)" 
            type="number" 
            placeholder="e.g. 500" 
            value={formData.minOrder}
            onChange={e => setFormData({...formData, minOrder: e.target.value})}
          />
        </div>
      </Modal>
    </div>
  );
}
