import React, { useState } from 'react';
import { Tag, X } from 'lucide-react';

const CouponInput = ({ onApply, onRemove, appliedCoupon, loading }) => {
  const [code, setCode] = useState('');

  const handleApply = () => {
    if (code.trim()) {
      onApply(code);
      setCode('');
    }
  };

  if (appliedCoupon) {
    return (
        <div className="bg-bgCard border border-primary/30 rounded-2xl p-5 flex items-center justify-between animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-4">
                <div className="bg-primary/20 p-2.5 rounded-full text-primary">
                    <Tag size={20} />
                </div>
                <div>
                    <p className="font-bold text-primary text-sm uppercase tracking-wider">'{appliedCoupon.code}' Applied</p>
                    <p className="text-xs text-textSecondary mt-1">
                         Saved ₹{appliedCoupon.discountAmount}
                    </p>
                </div>
            </div>
            <button 
                onClick={onRemove}
                className="p-2 hover:bg-white/5 rounded-full text-textSecondary hover:text-primary transition-colors"
            >
                <X size={20} />
            </button>
        </div>
    );
  }

  return (
    <div className="bg-bgCard border border-borderColor/30 rounded-2xl p-2 flex items-center gap-3 transition-all focus-within:border-primary/50 group">
        <div className="pl-3 text-textSecondary group-focus-within:text-primary transition-colors">
            <Tag size={20} />
        </div>
        <input 
            type="text" 
            placeholder="Enter coupon code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="flex-1 p-2 bg-transparent text-white placeholder-textSecondary focus:outline-none font-bold text-sm tracking-widest"
        />
        <button 
            onClick={handleApply}
            disabled={!code || loading}
            className={`px-6 py-3 rounded-xl font-bold text-xs transition-all uppercase tracking-widest ${
                !code || loading
                ? 'bg-bgHeader text-textSecondary cursor-not-allowed border border-borderColor/30'
                : 'bg-primary text-bgMain hover:scale-[1.02] active:scale-[0.98]'
            }`}
        >
            {loading ? '...' : 'APPLY'}
        </button>
    </div>
  );
};

export default CouponInput;
