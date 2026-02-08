import React from 'react';
import { Menu, Search, Bell, User } from 'lucide-react';

const Navbar = ({ onOpenSidebar }) => {
  return (
    <header className="h-16 bg-bgCard border-b border-borderColor sticky top-0 z-30 flex items-center px-4 lg:px-6">
      <button 
        onClick={onOpenSidebar}
        className="lg:hidden p-2 mr-4 text-textMuted hover:bg-bgHover rounded-lg transition-colors"
      >
        <Menu size={24} />
      </button>

      <div className="flex-1 max-w-xl hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textDisabled w-5 h-5" />
          <input
            type="text"
            placeholder="Search for orders, items..."
            className="w-full pl-10 pr-4 py-2 bg-bgMain border border-borderColor rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm text-textPrimary placeholder-textDisabled"
          />
        </div>
      </div>

      <div className="flex-1 md:hidden">
        <h2 className="text-lg font-semibold text-textPrimary">Admin</h2>
      </div>

      <div className="flex items-center space-x-2 md:space-x-4">
        <button className="relative p-2 text-textMuted hover:bg-bgHover rounded-lg transition-colors">
          <Bell size={22} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border-2 border-bgCard"></span>
        </button>

        <div className="h-8 w-[1px] bg-dividerColor mx-2 hidden sm:block"></div>

        <button className="flex items-center space-x-3 p-1 rounded-lg hover:bg-bgHover transition-colors">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
            <User size={20} />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-textPrimary leading-none">Admin User</p>
            <p className="text-xs text-textMuted mt-1">Super Admin</p>
          </div>
        </button>
      </div>
    </header>
  );
};

export default Navbar;
