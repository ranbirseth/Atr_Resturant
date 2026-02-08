import React from 'react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { getOrders } from '../services/orderService';
import { 
  DollarSign, 
  ShoppingBag, 
  Clock, 
  CheckCircle2, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/ui/Card';

const orderData = [
  { name: 'Mon', orders: 45 },
  { name: 'Tue', orders: 52 },
  { name: 'Wed', orders: 38 },
  { name: 'Thu', orders: 65 },
  { name: 'Fri', orders: 48 },
  { name: 'Sat', orders: 85 },
  { name: 'Sun', orders: 72 },
];

const categoryData = [
  { name: 'Main Course', revenue: 4500, color: '#EF4444' }, // Red (Spicy/Hot)
  { name: 'Starters', revenue: 2800, color: '#DC9D1D' },    // Gold
  { name: 'Beverages', revenue: 1500, color: '#3B82F6' },   // Blue
  { name: 'Desserts', revenue: 1200, color: '#10B981' },    // Green
];

const popularItems = [
  { name: 'Butter Chicken', sales: 145, revenue: 2175, growth: 12 },
  { name: 'Paneer Tikka', sales: 120, revenue: 1440, growth: 8 },
  { name: 'Garlic Naan', sales: 310, revenue: 930, growth: 15 },
  { name: 'Dal Makhani', sales: 95, revenue: 1140, growth: -3 },
];

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color, loading }) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-2xl bg-${color}-900/20 text-${color}-400`}>
          <Icon size={24} />
        </div>
        {!loading && trendValue !== undefined && (
          <div className={`flex items-center text-sm font-medium ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
            {trend === 'up' ? <ArrowUpRight size={16} className="mr-1" /> : <ArrowDownRight size={16} className="mr-1" />}
            {trendValue}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-medium text-textSecondary">{title}</h3>
        {loading ? (
          <div className="h-8 w-24 bg-bgSecondary animate-pulse rounded mt-1" />
        ) : (
          <p className="text-2xl font-bold text-textPrimary mt-1">{value}</p>
        )}
      </div>
    </CardContent>
  </Card>
);

export default function Dashboard() {
  const [orders, setOrders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getOrders();
        setOrders(data);
      } catch (error) {
        console.error('Dashboard fetch error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Derived Stats
  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === 'Pending').length;
  const completedOrders = orders.filter(o => o.status === 'Completed').length;

  // Chart Data: Orders Trend (Last 7 Days)
  const last7Days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const orderTrendData = last7Days.map(date => {
    const count = orders.filter(o => o.createdAt.startsWith(date)).length;
    const label = new Date(date).toLocaleDateString([], { weekday: 'short' });
    return { name: label, orders: count };
  });

  // Chart Data: Revenue by Category
  const categoryMap = {};
  orders.forEach(order => {
    order.items.forEach(item => {
      // Note: Backend might not store category in Order but in Item. 
      // Assuming for now it's grouped by 'Veg' vs 'Non-Veg' or specific categories if available.
      const cat = item.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + (item.price * item.quantity);
    });
  });

  const categoryChartData = Object.entries(categoryMap).map(([name, revenue]) => ({
    name, 
    revenue,
    color: name === 'Veg' ? '#10B981' : name === 'Non-Veg' ? '#EF4444' : '#DC9D1D'
  }));

  // Popular Items
  const itemMap = {};
  orders.forEach(order => {
    order.items.forEach(item => {
      if (!itemMap[item.name]) {
        itemMap[item.name] = { name: item.name, sales: 0, revenue: 0 };
      }
      itemMap[item.name].sales += item.quantity;
      itemMap[item.name].revenue += (item.price * item.quantity);
    });
  });

  const popularItems = Object.values(itemMap)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5)
    .map(item => ({ ...item, growth: Math.floor(Math.random() * 20) })); // Random growth for visual

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">Dashboard Overview</h1>
        <p className="text-textMuted text-sm mt-1">Welcome back, Admin! Here's what's happening today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <StatCard 
          title="Total Revenue" 
          value={`₹${totalRevenue.toLocaleString()}`} 
          icon={DollarSign} 
          trend="up" 
          trendValue={12.5} 
          color="green"
          loading={loading}
        />
        <StatCard 
          title="Total Orders" 
          value={totalOrders} 
          icon={ShoppingBag} 
          trend="up" 
          trendValue={8.2} 
          color="blue"
          loading={loading}
        />
        <StatCard 
          title="Pending Orders" 
          value={pendingOrders} 
          icon={Clock} 
          trend="down" 
          trendValue={5.4} 
          color="amber"
          loading={loading}
        />
        <StatCard 
          title="Completed Orders" 
          value={completedOrders} 
          icon={CheckCircle2} 
          trend="up" 
          trendValue={10.1} 
          color="indigo"
          loading={loading}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders Line Chart */}
        <Card>
          <CardHeader 
            title="Orders Trend" 
            subtitle="Daily order count for the last 7 days"
            action={<TrendingUp className="text-textDisabled" size={20} />}
          />
          <CardContent className="h-80">
            {loading ? (
               <div className="w-full h-full flex items-center justify-center text-textMuted">Loading charts...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={orderTrendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3D251E" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#2A1612',
                      borderRadius: '12px', 
                      border: '1px solid #3D251E', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)',
                      color: '#F9FAFB'
                    }}
                    itemStyle={{ color: '#F9FAFB' }}
                    labelStyle={{ color: '#9CA3AF' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="orders" 
                    stroke="#DC9D1D" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#DC9D1D', strokeWidth: 2, stroke: '#fff' }}  
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Revenue Bar Chart */}
        <Card>
          <CardHeader 
            title="Revenue by Category" 
            subtitle="Total revenue breakdown per food category"
          />
          <CardContent className="h-80">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center text-textMuted">Loading charts...</div>
            ) : categoryChartData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-textDisabled">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#3D251E" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                    width={100}
                  />
                  <Tooltip 
                     cursor={{ fill: '#3D251E' }}
                     contentStyle={{ 
                      backgroundColor: '#2A1612',
                      borderRadius: '12px', 
                      border: '1px solid #3D251E', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)',
                      color: '#F9FAFB'
                    }} 
                    itemStyle={{ color: '#F9FAFB' }}
                    labelStyle={{ color: '#9CA3AF' }}
                  />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Popular Items */}
      <Card>
        <CardHeader 
          title="Popular Items" 
          subtitle="Top performing dishes by sales volume"
        />
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-borderColor bg-bgSecondary">
                  <th className="px-6 py-4 text-xs font-bold text-textMuted uppercase tracking-wider">Item Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-textMuted uppercase tracking-wider">Total Sales</th>
                  <th className="px-6 py-4 text-xs font-bold text-textMuted uppercase tracking-wider">Revenue</th>
                  <th className="px-6 py-4 text-xs font-bold text-textMuted uppercase tracking-wider text-right">Growth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderColor">
                {loading ? (
                  Array(3).fill(0).map((_, i) => (
                    <tr key={i}><td colSpan={4} className="px-6 py-4 bg-bgSecondary animate-pulse h-12" /></tr>
                  ))
                ) : popularItems.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-textMuted">No data available yet</td></tr>
                ) : popularItems.map((item, index) => (
                  <tr key={index} className="hover:bg-bgHover transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-textPrimary">{item.name}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-textSecondary">{item.sales}</td>
                    <td className="px-6 py-4 text-sm text-textSecondary">₹{item.revenue.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${item.growth >= 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                        {item.growth > 0 ? '+' : ''}{item.growth}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
