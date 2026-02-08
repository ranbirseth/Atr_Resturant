# Customer-Wise Session-Based Order Grouping Feature

## 📋 Overview

This feature implements intelligent order grouping in the Admin Dashboard. Orders from the same customer during the same visit/session are now grouped together, reducing clutter and providing a better overview of customer activity.

## 🎯 Key Features

### Backend
- **Session Management**: Day-based session strategy (all orders from the same customer on the same day are grouped)
- **SessionId Generation**: Automatic sessionId assignment to all orders based on `user_{userId}_date_{YYYYMMDD}` format
- **Grouped API Endpoint**: New `/api/orders/grouped` endpoint that returns session-grouped orders
- **Real-time Updates**: Socket.IO events (`sessionOrderUpdate`) for live dashboard updates
- **Session-wide Status**: Status updates apply to all orders in the same session

### Admin Dashboard
- **Card-based UI**: Beautiful card layout displaying grouped customer sessions
- **Expandable Items**: Shows first 3 items with option to expand and see more
- **Customer Info**: Displays customer name, phone, order type, table number
- **Order Count**: Shows number of orders and total items in the session
- **Session Total**: Combined total amount across all orders
- **Real-time Sync**: Automatically updates when new orders arrive
- **Session Billing**: Generate PDF bills for entire session with all orders combined

## 📁 Files Created/Modified

### Backend Files Created
- ✨ `server/utils/SessionManager.js` - Session ID generation and validation utility
- ✨ `server/scripts/migrateExistingOrders.js` - Migration script for existing orders

### Backend Files Modified
- 📝 `server/models/Order.js` - Added sessionId field with indexing
- 📝 `server/controllers/orderController.js` - Added getGroupedOrders, updated createOrder and updateOrderStatus
- 📝 `server/routes/orderRoutes.js` - Added /grouped endpoint

### Frontend Files Created
- ✨ `AdminDashboard/src/components/SessionOrderCard.jsx` - Card component for displaying grouped sessions

### Frontend Files Modified
- 📝 `AdminDashboard/src/services/orderService.js` - Added getGroupedOrders function
- 📝 `AdminDashboard/src/pages/Orders.jsx` - Complete refactor to support grouped view

## 🚀 Usage

### Running the Migration (One-time)

If you have existing orders in the database, run the migration script:

```bash
cd server
node scripts/migrateExistingOrders.js
```

This will add unique sessionIds to all existing orders.

### API Endpoints

#### Get Grouped Orders
```http
GET /api/orders/grouped
```

Returns orders grouped by session with combined totals and status.

**Response:**
```json
[
  {
    "sessionId": "user_65abc123_date_20260123",
    "userId": {
      "_id": "65abc123",
      "name": "John Doe",
      "mobile": "9876543210"
    },
    "orders": [
      {
        "_id": "order1",
        "items": [...],
        "totalAmount": 500,
        ...
      },
      {
        "_id": "order2",
        "items": [...],
        "totalAmount": 300,
        ...
      }
    ],
    "totalAmount": 800,
    "grossTotal": 900,
    "discountAmount": 100,
    "status": "Preparing",
    "orderType": "Dine-in",
    "tableNumber": "5",
    "createdAt": "2026-01-23T10:00:00Z",
    "updatedAt": "2026-01-23T10:15:00Z"
  }
]
```

#### Update Order Status
```http
PUT /api/orders/:orderId/status
Content-Type: application/json

{
  "status": "Ready"
}
```

Updates all orders in the same session to the new status.

### Socket.IO Events

#### `sessionOrderUpdate`
Emitted when a new order is created or updated.

**Payload:**
```javascript
{
  sessionId: "user_65abc123_date_20260123",
  orders: [/* array of order objects */]
}
```

### Admin Dashboard Usage

1. **View Grouped Orders**: Orders are automatically displayed as session cards
2. **Expand Items**: Click "Show X more items" to see all items in the session
3. **Update Status**: Click action buttons to update session status
4. **View Details**: Click "View Details" to see all individual orders
5. **Generate Bill**: Click billing icon to generate session PDF bill
6. **Real-time Updates**: Dashboard automatically updates when new orders arrive

## 🔧 Session Strategy

**Day-based Sessions:**
- All orders from the same customer on the same calendar day share one sessionId
- New day = new session
- SessionId format: `user_{userId}_date_{YYYYMMDD}`

**Examples:**
- Customer orders at 12:00 PM → sessionId: `user_abc123_date_20260123`
- Same customer orders at 2:00 PM (same day) → Same sessionId
- Same customer orders next day → New sessionId: `user_abc123_date_20260124`

## 📊 Status Management

Status updates are applied to the entire session:
- When you mark one order as "Preparing", all orders in that session update to "Preparing"
- This ensures consistent state across all orders from the same customer visit

**Status Priority** (for display):
1. Pending (highest priority - shows if any order is pending)
2. Preparing
3. Ready
4. Completed (lowest priority)
5. Cancelled

## 🔄 Backward Compatibility

Existing orders without sessionId are handled by the migration script:
- Each existing order gets a unique legacy sessionId: `legacy_{orderId}`
- They display as individual sessions
- No data loss occurs
- Future orders from the same customer use the new grouping logic

## 🎨 UI Features

### SessionOrderCard Component
- Customer avatar and info
- Order type and table number badges
- Item list with quantities and customizations
- Combined total display
- Status badge
- Action buttons (status updates, view details)
- Expandable item list

### Real-time Notifications
- Browser notifications when new orders arrive
- Automatic card creation/update
- Visual feedback for status changes

## 🧪 Testing Checklist

- ✅ Migration script successfully ran
- ⏳ New order creates session
- ⏳ Multiple orders from same customer on same day group together
- ⏳ Orders from different days create separate sessions
- ⏳ Status updates affect entire session
- ⏳ Real-time updates work correctly
- ⏳ PDF billing generates correctly for sessions

## 📝 Notes

- The feature is fully backward compatible
- Individual order view is still accessible via "View Details"
- Socket.IO must be connected for real-time updates
- Session grouping happens automatically based on customerand date

## 🔮 Future Enhancements

Potential improvements:
- Configurable session duration (time-based vs day-based)
- Session analytics and insights
- Merge/split session functionality
- Export session reports
- Session-based loyalty points
