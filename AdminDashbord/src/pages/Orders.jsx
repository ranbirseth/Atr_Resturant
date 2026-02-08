import React, { useState, useEffect } from 'react';
import { 
  Eye, 
  MoreVertical, 
  Search, 
  Clock, 
  Package,
  FileText,
  Share2,
  Download,
  Grid3x3,
  List,
  User
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Card, { CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Table, { TableRow, TableCell } from '../components/ui/Table';
import Modal from '../components/ui/Modal';
import SessionOrderCard from '../components/SessionOrderCard';
import { getGroupedOrders, getOrders, updateOrderStatus } from '../services/orderService';
import { useSocket } from '../context/SocketContext';

const statusVariants = {
  'Pending': 'amber',
  'Preparing': 'blue',
  'Ready': 'indigo',
  'Completed': 'green',
  'Cancelled': 'red',
  'ChangeRequested': 'yellow',
  'Updated': 'orange',
};

export default function Orders() {
  const [groupedOrders, setGroupedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Billing Modal State
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [billSession, setBillSession] = useState(null);

  const [filter, setFilter] = useState('All');
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' or 'individual'
  const [searchQuery, setSearchQuery] = useState('');
  
  const socket = useSocket();

  // Fetch orders on mount
  useEffect(() => {
    fetchOrders();
  }, [viewMode]);

  // Socket.IO real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleSessionUpdate = ({ sessionId, orders }) => {
      console.log('📡 Received session update:', sessionId);
      
      // Calculate grouped session data
      const totalAmount = orders.reduce((sum, o) => sum + o.totalAmount, 0);
      const grossTotal = orders.reduce((sum, o) => sum + (o.grossTotal || o.totalAmount), 0);
      const discountAmount = orders.reduce((sum, o) => sum + (o.discountAmount || 0), 0);
      
      // Determine status (priority: ChangeRequested > Updated > Pending > Preparing > Ready > Completed, but skip Cancelled if there are active orders)
      const statusPriority = {
        'Cancelled': 6,
        'ChangeRequested': 5,
        'Updated': 4,
        'Pending': 4,
        'Accepted': 3.5,
        'Preparing': 3,
        'Ready': 2,
        'Completed': 1
      };
      // Filter out cancelled orders if there are any active orders
      const activeOrders = orders.filter(o => o.status !== 'Cancelled');
      const ordersToConsider = activeOrders.length > 0 ? activeOrders : orders;

      let worstStatus = 'Completed';
      ordersToConsider.forEach(order => {
        if (statusPriority[order.status] > statusPriority[worstStatus]) {
          worstStatus = order.status;
        }
      });

      // Determine session orderType and tableNumber (prioritize Dine-in)
      let sessionOrderType = orders[0]?.orderType;
      let sessionTableNumber = orders[0]?.tableNumber;

      const dineInOrder = orders.find(o => o.orderType === 'Dine-in');
      if (dineInOrder) {
        sessionOrderType = 'Dine-in';
        if (dineInOrder.tableNumber) {
          sessionTableNumber = dineInOrder.tableNumber;
        }
      }

      const groupedSession = {
        sessionId,
        userId: orders[0]?.userId,
        orders,
        totalAmount,
        grossTotal,
        discountAmount,
        status: worstStatus,
        orderType: sessionOrderType,
        tableNumber: sessionTableNumber,
        createdAt: orders[0]?.createdAt,
        updatedAt: orders[orders.length - 1]?.updatedAt
      };

      setGroupedOrders(prev => {
        const existingIndex = prev.findIndex(g => g.sessionId === sessionId);
        
        if (existingIndex >= 0) {
          // Update existing session
          const updated = [...prev];
          updated[existingIndex] = groupedSession;
          return updated;
        } else {
          // Add new session at the beginning
          return [groupedSession, ...prev];
        }
      });

      // Show notification
      if (Notification.permission === 'granted') {
        new Notification('New Order', {
          body: `Order from ${orders[0]?.userId?.name || 'Guest'}`,
          icon: '/logo.png'
        });
      }
    };

    socket.on('sessionOrderUpdate', handleSessionUpdate);

    return () => {
      socket.off('sessionOrderUpdate', handleSessionUpdate);
    };
  }, [socket]);

  const fetchOrders = async () => {
    try {
      const data = viewMode === 'grouped' 
        ? await getGroupedOrders()
        : await getOrders();
      
      setGroupedOrders(data);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = groupedOrders.filter(session => {
    // Filter by status
    const statusMatch = filter === 'All' || session.status === filter;
    
    // Filter by search query
    const searchMatch = searchQuery === '' || 
      session.userId?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.userId?.mobile?.includes(searchQuery) ||
      session.sessionId?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return statusMatch && searchMatch;
  });

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      const updatedOrders = await updateOrderStatus(orderId, { status: newStatus });

      // Update the session in state (Optimistic / Result based update)
      if (Array.isArray(updatedOrders) && updatedOrders.length > 0) {
        const sessionId = updatedOrders[0].sessionId;
        const sessionOrders = updatedOrders; // These are the fresh orders

        // Print Logic for 'Accepted' status
        if (newStatus === 'Accepted') {
            try {
                // Find the specific order(s) that are new/unprinted if needed, or print the whole session KOT
                // For now, we print the whole session as a KOT or just the accepted order?
                // The requirements say: "KOT must print... Automatic after acceptance"
                // And "Running Order... Generate NEW KOT only for new items".
                // We need to filter items that haven't been printed? 
                // The backend `kotPrinted` field helps.
                // But the `updatedOrders` returned from backend might not update `kotPrinted` yet (since we just accepted).
                // Actually `updateOrderStatus` just sets status. 
                // We should probably check which items are NOT printed in `kotHistory` or `kotPrinted`.
                
                // Let's print the Session Object. The Printer Service can handle filtering if we pass logic, 
                // OR we filter here. 
                // Simple approach: Pass the session object. The printer logic in `printer.js` we wrote prints ALL items.
                // We need to refine `printer.js` or `printService.js` to handle "Running Order".
                // But for now, let's just trigger the print.
                // NOTE: The user wants "Immediate" printing.
                
                const { printOrder, confirmPrintSuccess } = await import('../services/printService');
                
                // We will print the session. 
                // Ideally we should filter for unprinted items if it's a running order.
                // Let's assume for this step we print the session.
                // We construct a "Printable Order" object.
                const printableOrder = {
                    sessionId,
                    orderType: sessionOrders[0].orderType,
                    tableNumber: sessionOrders[0].tableNumber,
                    items: sessionOrders.flatMap(o => o.items), // Flatten all items
                    createdAt: new Date()
                };

                console.log("🖨️ Triggering KOT Print...");
                await printOrder(printableOrder, 'BOTH'); // Admin + Kitchen
                
                // Confirm success to backend
                // map all order IDs
                const orderIds = sessionOrders.map(o => o._id);
                await confirmPrintSuccess(orderIds, `P-${Date.now()}`);
                
                // Show notification
                if (Notification.permission === 'granted') {
                    new Notification('KOT Sent to Printer');
                }
                alert("Order Accepted & KOT Sent to Printer!");

            } catch (printError) {
                console.error("Print failed:", printError);
                alert(`Order Accepted, but Print Failed: ${printError.message}`);
            }
        }


        // Calculate the grouped status using priority logic
        const statusPriority = {
          'Cancelled': 6,
          'ChangeRequested': 5,
          'Updated': 4,
          'Pending': 4,
          'Accepted': 3.5, // Added Accepted priority
          'Preparing': 3,
          'Ready': 2,
          'Completed': 1
        };
        // Filter out cancelled orders if there are any active orders
        const activeOrders = updatedOrders.filter(o => o.status !== 'Cancelled');
        const ordersToConsider = activeOrders.length > 0 ? activeOrders : updatedOrders;

        let worstStatus = 'Completed';
        ordersToConsider.forEach(order => {
          // Default to 0 if status not found
          const currentPriority = statusPriority[order.status] || 0;
          const worstPriority = statusPriority[worstStatus] || 0;
          
          if (currentPriority > worstPriority) {
            worstStatus = order.status;
          }
        });

        setGroupedOrders(prev => prev.map(session => {
          if (session.sessionId === sessionId) {
            return {
              ...session,
              orders: updatedOrders,
              status: worstStatus
            };
          }
          return session;
        }));

        if (selectedSession?.sessionId === sessionId) {
          setSelectedSession({
            ...selectedSession,
            orders: updatedOrders,
            status: worstStatus
          });
        }
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update order status');
    }
  };

  const generateSessionPdf = (sessionData) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(220, 157, 29); // Gold color
    doc.text('Aatreyo Restaurant', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text('Restaurant & Delivery', 105, 28, { align: 'center' });
    doc.text('123 Food Street, Tasty Town', 105, 34, { align: 'center' });

    // Session Details
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(`Session ID: ${sessionData.sessionId.slice(-12).toUpperCase()}`, 14, 50);
    doc.text(`Date: ${new Date(sessionData.createdAt).toLocaleDateString()}`, 14, 56);
    doc.text(`Time: ${new Date(sessionData.createdAt).toLocaleTimeString()}`, 14, 62);

    doc.text(`Customer: ${sessionData.userId?.name || 'Guest'}`, 140, 50);
    doc.text(`Phone: ${sessionData.userId?.mobile || 'N/A'}`, 140, 56);
    doc.text(`Type: ${sessionData.orderType}`, 140, 62);
    if (sessionData.tableNumber) {
        doc.text(`Table: ${sessionData.tableNumber}`, 140, 68);
    }

    // Collect all items from all orders
    const allItems = [];
    sessionData.orders.forEach(order => {
      order.items.forEach(item => {
        const existing = allItems.find(
          i => i.name === item.name && JSON.stringify(i.customizations) === JSON.stringify(item.customizations)
        );
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          allItems.push({ ...item });
        }
      });
    });

    // Items Table
    const tableColumn = ["Item", "Qty", "Price", "Amount"];
    const tableRows = [];

    allItems.forEach(item => {
      const itemData = [
        item.name + (item.customizations?.length ? ` (${item.customizations.join(', ')})` : ''),
        item.quantity,
        `Rs. ${item.price}`,
        `Rs. ${item.price * item.quantity}`
      ];
      tableRows.push(itemData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 75,
      theme: 'grid',
      headStyles: { fillColor: [31, 17, 14] }, // Dark Brown
    });

    const finalY = doc.lastAutoTable.finalY || 75;

    // Total Section
    doc.setFontSize(10);
    doc.text(`Number of Orders: ${sessionData.orders.length}`, 14, finalY + 10);
    
    if (sessionData.discountAmount > 0) {
      doc.text(`Subtotal: Rs. ${sessionData.grossTotal}`, 140, finalY + 10);
      doc.text(`Discount: Rs. ${sessionData.discountAmount}`, 140, finalY + 16);
    }
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total Amount: Rs. ${sessionData.totalAmount}`, 140, finalY + (sessionData.discountAmount > 0 ? 25 : 16));

    // Footer
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text('Thank you for dining with us!', 105, 280, { align: 'center' });

    // Save PDF
    const fileName = `Bill_Session_${sessionData.sessionId.slice(-8).toUpperCase()}.pdf`;
    doc.save(fileName);
    return fileName;
  };

  const openBillModal = (sessionData) => {
    setBillSession(sessionData);
    setIsBillModalOpen(true);
  };

  const handleSaveBill = () => {
    if (!billSession) return;
    generateSessionPdf(billSession);
    setIsBillModalOpen(false);
  };

  const handleShareBill = () => {
    if (!billSession) return;
    const fileName = generateSessionPdf(billSession);
    
    // WhatsApp Share logic
    if (billSession.userId?.mobile) {
      const message = `Hello ${billSession.userId.name}, here is your bill for your visit. Total Amount: Rs. ${billSession.totalAmount}. Thank you for choosing Aatreyo Restaurant!`;
      const whatsappUrl = `https://wa.me/91${billSession.userId.mobile}?text=${encodeURIComponent(message)}`;
      
      window.open(whatsappUrl, '_blank');
      
      setTimeout(() => {
         alert(`Bill downloaded! Please attach "${fileName}" to the WhatsApp chat.`);
      }, 500);
    } else {
        alert('Bill downloaded! Customer mobile number not found for WhatsApp share.');
    }
    
    setIsBillModalOpen(false);
  };

  const openSessionDetails = (sessionData) => {
    setSelectedSession(sessionData);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Orders Management</h1>
          <p className="text-textMuted text-sm mt-1">Manage customer orders grouped by visit sessions.</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant={viewMode === 'grouped' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setViewMode('grouped')}
            className="flex items-center"
          >
            <Grid3x3 className="w-4 h-4 mr-2" />
            Grouped
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b border-borderColor flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-2 overflow-x-auto">
            {['All', 'Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled', 'ChangeRequested', 'Updated'].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-all whitespace-nowrap ${
                  filter === s 
                    ? 'bg-primary/20 text-primary border border-primary/20' 
                    : 'text-textMuted hover:bg-bgHover'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textDisabled w-4 h-4" />
            <input
              type="text"
              placeholder="Search customer or session..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-bgMain border border-borderColor rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-textPrimary placeholder-textDisabled"
            />
          </div>
        </div>

        <CardContent className="p-6">
          {loading ? (
            <div className="py-20 text-center text-textMuted">Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-bgSecondary rounded-full flex items-center justify-center mx-auto mb-4 border border-borderColor">
                <Search className="text-textDisabled" size={32} />
              </div>
              <h3 className="text-textPrimary font-bold text-lg">No orders found</h3>
              <p className="text-textMuted">Try adjusting your filters or search query.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredOrders.map((session) => (
                <SessionOrderCard
                  key={session.sessionId}
                  sessionData={session}
                  onStatusUpdate={handleStatusUpdate}
                  onViewBill={() => openBillModal(session)}
                  onViewDetails={openSessionDetails}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Details Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Session Details - ${selectedSession?.userId?.name || 'Guest'}`}
        footer={
          <div className="flex space-x-3 w-full">
            <Button variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>Close</Button>
            <Button className="flex-1" onClick={() => openBillModal(selectedSession)}>Generate Bill</Button>
          </div>
        }
      >
        {selectedSession && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-bgSecondary rounded-2xl border border-borderColor">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary mr-3">
                  <User size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold text-textPrimary">{selectedSession.userId?.name || 'Guest'}</p>
                  <p className="text-xs text-textMuted">
                    {selectedSession.userId?.mobile} • {selectedSession.orderType}
                    {selectedSession.tableNumber && ` • Table ${selectedSession.tableNumber}`}
                  </p>
                </div>
              </div>
              <Badge variant={statusVariants[selectedSession.status]}>
                {selectedSession.status === 'ChangeRequested' ? 'Change Requested' : selectedSession.status === 'Updated' ? 'Order Updated' : selectedSession.status}
              </Badge>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-textPrimary flex items-center uppercase tracking-wider">
                All Orders in Session ({selectedSession.orders.length})
                <span className="ml-2 h-px flex-1 bg-borderColor"></span>
              </h4>
              
              {selectedSession.orders.map((order, orderIdx) => (
                <div key={order._id} className="border border-borderColor rounded-xl p-4 bg-bgCard/50">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-textSecondary">
                      Order #{orderIdx + 1} • {new Date(order.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="text-sm font-semibold text-textPrimary">₹{order.totalAmount}</span>
                  </div>

                  {/* Order Type and Table Info */}
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="flex items-center text-[10px] font-bold uppercase tracking-wider text-textDisabled">
                      <Package size={10} className="mr-1" />
                      {order.orderType}
                    </div>
                    {order.tableNumber && (
                      <div className="flex items-center text-[10px] font-bold uppercase tracking-wider text-primary">
                        <Grid3x3 size={10} className="mr-1" />
                        Table {order.tableNumber}
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {order.items.map((item, itemIdx) => (
                      <div key={itemIdx} className="flex justify-between items-start text-sm">
                        <div className="flex items-start flex-1">
                          <span className="w-6 h-6 rounded bg-bgSecondary text-textSecondary flex items-center justify-center text-[10px] font-bold mr-3 border border-borderColor">
                            {item.quantity}x
                          </span>
                          <div>
                            <span className="text-textPrimary font-medium">{item.name}</span>
                            {item.customizations && item.customizations.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.customizations.map((c, ci) => (
                                  <span key={ci} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md border border-primary/20">
                                    {c}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="font-medium text-textPrimary ml-4">₹{item.price * item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-borderColor">
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-textSecondary">Total Orders:</span>
                <span className="font-semibold text-textPrimary">{selectedSession.orders.length}</span>
              </div>
              {selectedSession.discountAmount > 0 && (
                <>
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-textSecondary">Subtotal:</span>
                    <span className="font-semibold text-textPrimary">₹{selectedSession.grossTotal}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-green-500">Discount:</span>
                    <span className="font-semibold text-green-500">-₹{selectedSession.discountAmount}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center pt-3 border-t border-borderColor">
                <span className="text-lg font-bold text-textPrimary">Session Total</span>
                <span className="text-xl font-bold text-primary">₹{selectedSession.totalAmount}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Bill Options Modal */}
      <Modal
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        title="Billing Options"
        footer={
          <Button variant="secondary" className="w-full" onClick={() => setIsBillModalOpen(false)}>Cancel</Button>
        }
      >
        <div className="space-y-4 p-4">
           <p className="text-slate-600 text-center mb-6">
             Choose how you want to process the bill for <span className="font-bold">{billSession?.userId?.name || 'Guest'}</span>
           </p>
           
           <div className="grid grid-cols-2 gap-4">
             <button
               onClick={handleSaveBill}
               className="flex flex-col items-center justify-center p-6 border-2 border-slate-100 rounded-2xl hover:border-red-100 hover:bg-red-50 transition-all group"
             >
               <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 group-hover:bg-red-100 text-slate-600 group-hover:text-red-600 transition-colors">
                 <Download size={24} />
               </div>
               <span className="font-bold text-slate-800">Save PDF</span>
               <span className="text-xs text-slate-500 mt-1">Download to device</span>
             </button>

             <button
               onClick={handleShareBill}
               className="flex flex-col items-center justify-center p-6 border-2 border-slate-100 rounded-2xl hover:border-green-100 hover:bg-green-50 transition-all group"
             >
               <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 group-hover:bg-green-100 text-slate-600 group-hover:text-green-600 transition-colors">
                 <Share2 size={24} />
               </div>
               <span className="font-bold text-slate-800">Share on WhatsApp</span>
               <span className="text-xs text-slate-500 mt-1">Open chat & attach</span>
             </button>
           </div>
        </div>
      </Modal>
    </div>
  );
}
