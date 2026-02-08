import React from 'react';
import { X, Plus } from 'lucide-react';

const UpsellModal = ({ onClose, onAddItem, upsellItem }) => {
    if (!upsellItem) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-bgModal rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl shadow-black/50 border border-borderColor/50 animate-in zoom-in-95 duration-300 relative">
                 <button 
                    onClick={() => onClose()} 
                    className="absolute top-4 right-4 z-20 text-textSecondary hover:text-primary transition-colors"
                >
                    <X size={24} />
                </button>

                <div className="p-8 text-center pt-12">
                     <p className="text-primary font-bold text-xs uppercase tracking-[0.2em] mb-4">Would you like a side?</p>
                     
                     <img 
                        src={upsellItem.image} 
                        alt={upsellItem.name} 
                        className="w-full h-48 object-cover rounded-xl mb-6 shadow-lg"
                    />

                    <h3 className="text-2xl font-serif font-bold text-primary mb-1 uppercase tracking-tight">{upsellItem.name}</h3>
                    <p className="text-xl font-bold text-white mb-10">₹{upsellItem.price}</p>

                    <div className="space-y-4">
                        <button 
                            onClick={() => onAddItem(upsellItem)}
                            className="w-full py-4 bg-primary text-bgMain rounded-xl font-bold text-sm shadow-lg shadow-primary/10 hover:bg-primaryHover active:scale-[0.98] transition-all uppercase tracking-wide"
                        >
                            Add to Order
                        </button>
                        
                        <button 
                            onClick={() => onClose()} 
                            className="w-full py-2 text-textSecondary font-bold text-xs hover:text-primary transition-colors uppercase tracking-[0.15em]"
                        >
                            No thanks, continue
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UpsellModal;
