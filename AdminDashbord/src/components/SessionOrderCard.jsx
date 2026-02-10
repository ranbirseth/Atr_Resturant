import React from 'react';
import { Clock, ChevronDown, ChevronUp, Package, User, Phone, MapPin, FileText, Printer } from 'lucide-react';
import Card, { CardContent } from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';

const statusVariants = {
  // New status system
  'PLACED': 'blue',
  'ACCEPTED': 'green',
  'CHANGED': 'yellow',
  'CANCELLED': 'red',
  'COMPLETED': 'slate',
  // Legacy statuses (backward compatibility)
  'Pending': 'amber',
  'Accepted': 'purple',
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
 * Each order is displayed individually with its own status and actions
 */
export default function SessionOrderCard({ sessionData, onStatusUpdate, onViewBill, onViewDetails }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const { sessionId, userId, orders, totalAmount, orderType, tableNumber, createdAt } = sessionData;

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Filter out cancelled and changed orders - they should not be visible to admin
  const visibleOrders = orders.filter(order => {
    const status = order.status;
    // Hide cancelled orders
    if (status === 'CANCELLED' || status === 'Cancelled') return false;
    // Hide changed orders (user needs to re-place them)
    if (status === 'CHANGED' || status === 'ChangeRequested' || status === 'Updated') return false;
    // Show all other orders (PLACED, ACCEPTED, Preparing, Ready, COMPLETED)
    return true;
  });

  // If no visible orders, don't render this session card at all
  if (visibleOrders.length === 0) {
    return null;
  }

  // Sort visible orders by status priority and timestamp
  const sortedOrders = [...visibleOrders].sort((a, b) => {
    const statusPriority = {
      'PLACED': 1,
      'Pending': 1,
      'CHANGED': 2,
      'ChangeRequested': 2,
      'Updated': 2,
      'ACCEPTED': 3,
      'Accepted': 3,
      'Preparing': 4,
      'Ready': 5,
      'CANCELLED': 6,
      'Cancelled': 6,
      'COMPLETED': 7,
      'Completed': 7
    };
    
    const priorityDiff = (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99);
    if (priorityDiff !== 0) return priorityDiff;
    
    // If same priority, sort by timestamp (newest first)
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const handleStatusChange = (orderId, newStatus) => {
    onStatusUpdate(orderId, newStatus);
  };

  // Determine if order can generate KOT/Bill
  const canGenerateKOT = (order) => {
    return order.status === 'ACCEPTED' || order.status === 'Accepted';
  };

  // Render action buttons based on order status
  const renderOrderActions = (order) => {
    const status = order.status;
    
    // PLACED or Pending - Show Accept button
    if (status === 'PLACED' || status === 'Pending') {
      return (
        <Button
          size="sm"
          className="flex-1"
          onClick={() => handleStatusChange(order._id, 'ACCEPTED')}
        >
          Accept Order
        </Button>
      );
    }
    
    // CHANGED or ChangeRequested/Updated - Show Re-Accept button
    if (status === 'CHANGED' || status === 'ChangeRequested' || status === 'Updated') {
      return (
        <Button
          size="sm"
          className="flex-1 bg-yellow-600 hover:bg-yellow-700"
          onClick={() => handleStatusChange(order._id, 'ACCEPTED')}
        >
          Re-Accept Order
        </Button>
      );
    }
    
    // ACCEPTED or Accepted - Show workflow buttons
    if (status === 'ACCEPTED' || status === 'Accepted') {
      return (
        <div className="flex space-x-2 flex-1">
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            size="sm"
            onClick={() => handleStatusChange(order._id, 'Preparing')}
          >
            Start Preparing
          </Button>
        </div>
      );
    }
    
    // Preparing - Show Ready button
    if (status === 'Preparing') {
      return (
        <Button
          className="flex-1 bg-indigo-600 hover:bg-indigo-700"
          size="sm"
          onClick={() => handleStatusChange(order._id, 'Ready')}
        >
          Mark as Ready
        </Button>
      );
    }
    
    // Ready - Show Complete button
    if (status === 'Ready') {
      return (
        <Button
          className="flex-1 bg-green-600 hover:bg-green-700"
          size="sm"
          onClick={() => handleStatusChange(order._id, 'COMPLETED')}
        >
          Complete Order
        </Button>
      );
    }
    
    // CANCELLED or Cancelled
    if (status === 'CANCELLED' || status === 'Cancelled') {
      return (
        <span className="flex-1 text-center text-red-500 font-semibold text-sm">
          Order Cancelled
        </span>
      );
    }
    
    // COMPLETED or Completed
    if (status === 'COMPLETED' || status === 'Completed') {
      return (
        <span className="flex-1 text-center text-slate-500 font-semibold text-sm">
          Order Completed
        </span>
      );
    }
    
    return null;
  };

  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <CardContent className="p-0">
        {/* Session Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center">
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
          </div>

          {/* Session Info */}
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
              {visibleOrders.length} order{visibleOrders.length > 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Individual Orders */}
        <div className="divide-y divide-slate-100">
          {sortedOrders.slice(0, isExpanded ? sortedOrders.length : 2).map((order, idx) => (
            <div 
              key={order._id} 
              className={`p-4 ${
                order.status === 'CANCELLED' || order.status === 'Cancelled' 
                  ? 'opacity-50 bg-slate-50' 
                  : order.status === 'CHANGED' || order.status === 'ChangeRequested' || order.status === 'Updated'
                  ? 'bg-yellow-50/50'
                  : 'bg-white'
              }`}
            >
              {/* Order Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-600">
                    {order.orderId || `Order #${idx + 1}`}
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-slate-500">
                    {formatTime(order.createdAt)}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={statusVariants[order.status]}>
                    {order.status}
                  </Badge>
                  <span className="text-sm font-bold text-slate-900">₹{order.totalAmount}</span>
                </div>
              </div>

              {/* Order Items */}
              <div className="space-y-2 mb-3">
                {order.items.slice(0, 3).map((item, itemIdx) => (
                  <div key={itemIdx} className="flex justify-between items-start text-sm">
                    <div className="flex items-start flex-1">
                      <span className="w-6 h-6 rounded bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold mr-2">
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
                  </div>
                ))}
                {order.items.length > 3 && (
                  <span className="text-xs text-slate-500">
                    +{order.items.length - 3} more item{order.items.length - 3 > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Order Change Indicator */}
              {order.previousOrderSnapshot && (
                <div className="mb-3 p-2 bg-yellow-100 border border-yellow-200 rounded-lg">
                  <div className="flex items-center text-xs text-yellow-800">
                    <FileText size={12} className="mr-1" />
                    <span className="font-semibold">Order Modified</span>
                    <span className="ml-1">- Re-acceptance required</span>
                  </div>
                </div>
              )}

              {/* Order Actions */}
              <div className="flex items-center space-x-2">
                {renderOrderActions(order)}
                
                {/* KOT/Bill buttons - only for ACCEPTED orders */}
                {canGenerateKOT(order) && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex items-center"
                      onClick={() => {
                        // TODO: Implement KOT generation
                        console.log('Generate KOT for order:', order.orderId);
                      }}
                    >
                      <Printer size={14} className="mr-1" />
                      KOT
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onViewBill(sessionData)}
                    >
                      Bill
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Expand/Collapse Button */}
        {sortedOrders.length > 2 && (
          <div className="p-3 bg-slate-50 border-t border-slate-100">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full text-xs text-red-600 hover:text-red-700 font-medium flex items-center justify-center"
            >
              {isExpanded ? (
                <>
                  <ChevronUp size={14} className="mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown size={14} className="mr-1" />
                  Show {sortedOrders.length - 2} more order{sortedOrders.length - 2 > 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        )}

        {/* Session Footer */}
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-600 font-medium">Session Total</span>
            <span className="text-2xl font-bold text-red-600">
              ₹{visibleOrders.reduce((sum, order) => sum + order.totalAmount, 0)}
            </span>
          </div>
          
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => onViewDetails(sessionData)}
          >
            View Session Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
