import React from 'react';
import { Scissors } from 'lucide-react';

const CouponCard = ({ coupon, onSelect }) => {
  return (
    <div 
        onClick={() => onSelect(coupon.code)}
        className="relative bg-bgCard border border-primary/20 rounded-2xl p-6 cursor-pointer hover:border-primary/50 transition-all group overflow-hidden"
    >
        {/* Decorative Side Notches */}
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-bgMain rounded-full border border-primary/20" />
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-bgMain rounded-full border border-primary/20" />

        <div className="flex justify-between items-center pl-2">
            <div>
                <h3 className="font-bold text-primary text-xl tracking-widest uppercase mb-1">{coupon.code}</h3>
                <p className="text-sm font-bold text-white uppercase tracking-tight">
                    {coupon.discountType === 'PERCENT' ? `${coupon.value}% OFF` : `₹${coupon.value} OFF`}
                </p>
                {coupon.minOrderAmount > 0 && (
                     <p className="text-[10px] text-textSecondary mt-2 uppercase tracking-wider font-bold">Min Order: ₹{coupon.minOrderAmount}</p>
                )}
            </div>
            <div className="text-primary opacity-20 group-hover:opacity-100 transition-opacity transform group-hover:scale-110">
                <Scissors size={24} />
            </div>
        </div>
    </div>
  );
};

export default CouponCard;
