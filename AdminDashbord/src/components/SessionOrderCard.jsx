import React from 'react';
import { Clock, ChevronDown, ChevronUp, Package, User, Phone, MapPin } from 'lucide-react';
import Card, { CardContent } from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';

const statusVariants = {
  'Pending': 'amber',
  'Accepted': 'purple', // distinct color
  'Preparing': 'blue',
  'Ready': 'indigo',
  'Completed': 'green',
  'Cancelled': 'red',
  'ChangeRequested': 'yellow',
  'Updated': 'orange',
};

/**
 * SessionOrderCard - Display component for grouped session orders
 * Shows all orders from a customer's single visit/session
 */
export default function SessionOrderCard({ sessionData, onStatusUpdate, onViewBill, onViewDetails }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const { sessionId, userId, orders, totalAmount, status, orderType, tableNumber, createdAt } = sessionData;

  // Collect all items from all orders in this session
  const allItems = [];
  orders.forEach(order => {
    order.items.forEach(item => {
      // Check if item already exists in allItems
      const existingIndex = allItems.findIndex(
        i => i.name === item.name && JSON.stringify(i.customizations) === JSON.stringify(item.customizations)
      );
      
      if (existingIndex >= 0) {
        // Merge quantities
        allItems[existingIndex].quantity += item.quantity;
      } else {
        // Add new item
        allItems.push({ ...item });
      }
    });
  });

  // Calculate item count
  const totalItems = allItems.reduce((sum, item) => sum + item.quantity, 0);

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleStatusChange = (newStatus) => {
    // Use the first order's ID for the API call (backend will update all in session)
    if (orders.length > 0) {
      onStatusUpdate(orders[0]._id, newStatus);
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <CardContent className="p-0">
        {/* Header Section */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-full bg-linear-to-br from-red-50 to-orange-50 flex items-center justify-center">
                <User className="text-red-600" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{userId?.name || 'Guest'}</h3>
                <div className="flex items-center space-x-3 mt-1">
                  {userId?.mobile && (
                    <div className="flex items-center text-slate-500 text-xs">
                      <Phone size={12} className="mr-1" />
                      {userId.mobile}
                    </div>
                  )}
                  <div className="flex items-center text-slate-500 text-xs">
                    <Clock size={12} className="mr-1" />
                    {formatTime(createdAt)} • {formatDate(createdAt)}
                  </div>
                </div>
              </div>
            </div>
            <Badge variant={statusVariants[status]}>
              {status === 'ChangeRequested' ? 'Change Requested' : status === 'Updated' ? 'Order Updated' : status}
            </Badge>
          </div>

          {/* Order Info */}
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center text-slate-600">
              <Package size={16} className="mr-1.5 text-slate-400" />
              <span className="font-medium">{orderType}</span>
            </div>
            {tableNumber && (
              <div className="flex items-center text-slate-600">
                <MapPin size={16} className="mr-1.5 text-slate-400" />
                <span className="font-medium">Table {tableNumber}</span>
              </div>
            )}
            {sessionData.isDelivery && (
              <div className="flex items-center text-slate-600 max-w-[200px]" title={sessionData.deliveryAddress}>
                <MapPin size={16} className="mr-1.5 text-orange-500" />
                <span className="font-medium truncate">{sessionData.deliveryAddress}</span>
              </div>
            )}
            <div className="text-slate-500">
              {orders.length} order{orders.length > 1 ? 's' : ''} • {totalItems} item{totalItems > 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Items Preview (First 3 items) */}
        <div className="p-4 bg-slate-50">
          <div className="space-y-2">
            {allItems.slice(0, isExpanded ? allItems.length : 3).map((item, idx) => (
              <div key={idx} className="flex justify-between items-start text-sm">
                <div className="flex items-start flex-1">
                  <span className="w-7 h-7 rounded bg-white text-slate-600 flex items-center justify-center text-xs font-bold mr-3 mt-0.5">
                    {item.quantity}x
                  </span>
                  <div>
                    <span className="text-slate-700 font-medium">{item.name}</span>
                    {item.customizations && item.customizations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.customizations.map((custom, ci) => (
                          <span key={ci} className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200">
                            {custom}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <span className="font-semibold text-slate-900 ml-4">₹{item.price * item.quantity}</span>
              </div>
            ))}
          </div>

          {allItems.length > 3 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-3 text-xs text-red-600 hover:text-red-700 font-medium flex items-center"
            >
              {isExpanded ? (
                <>
                  <ChevronUp size={14} className="mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown size={14} className="mr-1" />
                  Show {allItems.length - 3} more item{allItems.length - 3 > 1 ? 's' : ''}
                </>
              )}
            </button>
          )}
        </div>

        {/* Footer Section */}
        <div className="p-4 bg-white border-t border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-600 font-medium">Total Amount</span>
            <span className="text-2xl font-bold text-red-600">₹{totalAmount}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {status === 'Pending' && (
              <Button
                className="flex-1"
                size="sm"
                onClick={() => handleStatusChange('Accepted')}
              >
                Accept Order
              </Button>
            )}
            {status === 'Accepted' && (
              <div className="flex space-x-2 flex-1">
                 <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  size="sm"
                  onClick={() => handleStatusChange('Preparing')}
                >
                  Start Preparing
                </Button>
              </div>
            )}
            {status === 'Preparing' && (
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                size="sm"
                onClick={() => handleStatusChange('Ready')}
              >
                Mark as Ready
              </Button>
            )}
            {status === 'Ready' && (
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                size="sm"
                onClick={() => handleStatusChange('Completed')}
              >
                Complete Order
              </Button>
            )}
            {status === 'Cancelled' && (
              <span className="flex-1 text-center text-red-500 font-semibold">Order Cancelled</span>
            )}
            {status === 'ChangeRequested' && (
              <span className="flex-1 text-center text-yellow-600 font-semibold">Change Requested by User</span>
            )}
            {status === 'Updated' && (
              <span className="flex-1 text-center text-orange-500 font-semibold">Order Updated</span>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => onViewDetails(sessionData)}
            >
              View Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
