import React from 'react';

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  ...props 
}) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-primary text-textPrimary hover:bg-primaryHover focus:ring-primary shadow-sm hover:shadow',
    secondary: 'bg-bgCard text-textPrimary border border-borderColor hover:bg-bgHover focus:ring-gray-400',
    outline: 'bg-transparent text-primary border border-primary hover:bg-primary/10 hover:border-primaryHover focus:ring-primary',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900',
    danger: 'bg-rose-500 text-white hover:bg-rose-600 focus:ring-rose-400',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
    icon: 'p-2',
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
