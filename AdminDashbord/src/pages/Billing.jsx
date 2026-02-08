import React, { useState } from 'react';
import BillingScreen from '../components/billing/BillingScreen';
import MenuList from '../components/billing/MenuList';
import { LayoutDashboard, Utensils } from 'lucide-react';

export default function Billing() {
  const [currentView, setCurrentView] = useState('billing');

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] overflow-hidden bg-white rounded-3xl shadow-sm border border-slate-100 font-sans">
      {/* Internal Navigation for Billing App */}
      <nav className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md z-10 rounded-t-3xl">
        <div className="flex items-center gap-2">
          <div className="bg-primary-billing p-2 rounded-lg">
            <Utensils size={20} className="text-white" />
          </div>
          <span className="font-black text-xl tracking-tighter">POS SYSTEM</span>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setCurrentView('billing')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xs tracking-widest uppercase transition-all duration-200 ease-in-out shadow-none border border-transparent focus:outline-none focus:ring-2 focus:ring-primary-billing/60 focus:ring-offset-2 ${
              currentView === 'billing'
                ? 'bg-primary-billing text-white shadow-lg scale-105'
                : 'bg-transparent text-slate-400 hover:bg-primary-billing/90 hover:text-white hover:shadow-md hover:scale-105 hover:border-primary-billing/40'
            }`}
          >
            <LayoutDashboard size={14} />
            Billing
          </button>
          <button 
            onClick={() => setCurrentView('menu')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xs tracking-widest uppercase transition-all duration-200 ease-in-out shadow-none border border-transparent focus:outline-none focus:ring-2 focus:ring-primary-billing/60 focus:ring-offset-2 ${
              currentView === 'menu'
                ? 'bg-primary-billing text-white shadow-lg scale-105'
                : 'bg-transparent text-slate-400 hover:bg-primary-billing/90 hover:text-white hover:shadow-md hover:scale-105 hover:border-primary-billing/40'
            }`}
          >
            <Utensils size={14} />
            Inventory
          </button>
        </div>
      </nav>

      <main className="flex-1 overflow-hidden bg-slate-50">
        {currentView === 'billing' ? <BillingScreen /> : <MenuList />}
      </main>
    </div>
  );
}
