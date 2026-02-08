import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Printer, Share2, ArrowLeft, CheckCircle2, MessageSquare } from 'lucide-react';

const PrintableBill = ({ bill, onBack }) => {
  const componentRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
  });

  const shareOnWhatsApp = () => {
    const text = `*SECOND WIFE RESTAURANT*\nBill No: ${bill.billNumber}\nTotal: ₹${bill.grandTotal}\nThank you for dining with us!`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-2xl flex justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-sm">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-dark font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-all font-sans"
        >
          <ArrowLeft size={20} />
          New Bill
        </button>
        <div className="flex gap-3">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-black transition-all shadow-md font-sans"
          >
            <Printer size={20} />
            Print Bill
          </button>
          <button 
            onClick={shareOnWhatsApp}
            className="flex items-center gap-2 bg-green-500 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-600 transition-all shadow-md font-sans"
          >
            <MessageSquare size={20} />
            Share WhatsApp
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 font-sans">
        <div className="flex justify-center mb-6">
          <div className="bg-green-100 text-green-600 p-3 rounded-full">
            <CheckCircle2 size={48} />
          </div>
        </div>
        <h2 className="text-2xl font-black text-center text-gray-900 mb-1">Order Confirmed!</h2>
        <p className="text-gray-500 text-center mb-8">Bill #{bill.billNumber} has been generated</p>

        {/* Paper Receipt Simulation */}
        <div 
          ref={componentRef} 
          className="bg-white p-8 border-t-2 border-dashed border-gray-200 text-gray-800 font-mono text-sm leading-relaxed"
          style={{ width: '100%' }}
        >
          <div className="text-center mb-6">
            <h1 className="text-xl font-black uppercase tracking-widest mb-1">Second Wife</h1>
            <p className="text-xs">123 Food Street, Downtown</p>
            <p className="text-xs">Tel: +91 98765-43210</p>
            <div className="my-4 border-b border-gray-100"></div>
            <div className="flex justify-between text-[10px] uppercase font-bold text-gray-500">
              <span>Bill: {bill.billNumber}</span>
              <span>{new Date(bill.createdAt).toLocaleString()}</span>
            </div>
          </div>

          <table className="w-full mb-6 text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-2">ITEM</th>
                <th className="py-2 text-center">QTY</th>
                <th className="py-2 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {bill.items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-50">
                  <td className="py-3 font-bold">{item.name}</td>
                  <td className="py-3 text-center">{item.quantity}</td>
                  <td className="py-3 text-right">₹{item.total}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-2 border-t border-gray-200 pt-4">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>₹{bill.subtotal}</span>
            </div>
            <div className="flex justify-between">
              <span>GST (5%)</span>
              <span>₹{bill.gst}</span>
            </div>
            {bill.discount > 0 && (
              <div className="flex justify-between text-red-500">
                <span>Discount</span>
                <span>-₹{bill.discount}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-black pt-2 border-t border-gray-800">
              <span>TOTAL</span>
              <span>₹{bill.grandTotal}</span>
            </div>
          </div>

          <div className="mt-8 text-center bg-gray-50 p-4 rounded-lg">
            <p className="text-xs font-bold uppercase mb-1">Payment: {bill.paymentMode}</p>
            <p className="text-xs">THANK YOU FOR YOUR VISIT!</p>
            <p className="text-[10px] text-gray-400 mt-2">www.secondwiferestaurant.com</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableBill;
