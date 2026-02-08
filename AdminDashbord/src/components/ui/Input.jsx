import React from 'react';

const Input = ({ label, error, className = '', ...props }) => {
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-4 py-2.5 bg-white border rounded-xl text-slate-900 text-sm transition-all
          focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400
          disabled:bg-slate-50 disabled:text-slate-500
          ${error ? 'border-rose-500 ring-rose-50' : 'border-slate-200'}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-xs text-rose-500 mt-1">{error}</p>
      )}
    </div>
  );
};

export default Input;
