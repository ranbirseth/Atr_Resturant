import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  UtensilsCrossed, 
  Layers, 
  Users, 
  Ticket, 
  BarChart3, 
  Settings, 
  LogOut,
  X,
  Receipt,
  Star
} from 'lucide-react';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: ShoppingBag, label: 'Orders', path: '/orders' },
  { icon: UtensilsCrossed, label: 'Menu Management', path: '/menu' },
  { icon: Layers, label: 'Categories', path: '/categories' },
  { icon: Users, label: 'Users', path: '/users' },
  { icon: Ticket, label: 'Coupons', path: '/coupons' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
  { icon: Star, label: 'Reviews', path: '/reviews' },
  { icon: Settings, label: 'Settings', path: '/settings' },
  { icon: Receipt, label: 'Billing', path: '/billing' },
];

const Sidebar = ({ isOpen, onClose }) => {
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full bg-bgSidebar border-r border-borderColor z-50 w-64 transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 flex items-center justify-between border-b border-borderColor">
            <h1 className="text-xl font-bold text-textGold">Royal Indian Admin</h1>
            <button onClick={onClose} className="lg:hidden p-2 text-textMuted hover:text-primary">
              <X size={24} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {menuItems.map((item) => (
              item.external ? (
                <a
                  key={item.path}
                  href={item.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center px-4 py-3 rounded-xl transition-all duration-200 group text-textInverse hover:bg-bgSidebarHover hover:text-primary"
                  onClick={() => {
                    if (window.innerWidth < 1024) onClose();
                  }}
                >
                  <item.icon className="w-5 h-5 mr-4" />
                  <span>{item.label}</span>
                </a>
              ) : (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => {
                    if (window.innerWidth < 1024) onClose();
                  }}
                  className={({ isActive }) => `
                    flex items-center px-4 py-3 rounded-xl transition-all duration-200 group
                    ${isActive 
                      ? 'bg-bgSidebarActive text-textGold font-semibold border-l-4 border-textGold' 
                      : 'text-textInverse hover:bg-bgSidebarHover hover:text-primary'}
                  `}
                >
                  <item.icon className="w-5 h-5 mr-4" />
                  <span>{item.label}</span>
                </NavLink>
              )
            ))}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-borderColor">
            <button className="flex items-center w-full px-4 py-3 text-textInverse hover:bg-bgSidebarHover hover:text-primary rounded-xl transition-all duration-200">
              <LogOut className="w-5 h-5 mr-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
