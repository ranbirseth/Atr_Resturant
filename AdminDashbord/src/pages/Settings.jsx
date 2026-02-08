import React, { useState } from 'react';
import { 
  Store, 
  Clock, 
  IndianRupee, 
  User, 
  Shield, 
  Bell, 
  Save,
  ChevronRight
} from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('restaurant');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Configure your restaurant profile and application preferences.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Tabs */}
        <div className="w-full lg:w-64 space-y-2">
          {[
            { id: 'restaurant', label: 'Restaurant Profile', icon: Store },
            { id: 'orders', label: 'Order Settings', icon: Clock },
            { id: 'tax', label: 'Tax & VAT', icon: IndianRupee },
            { id: 'profile', label: 'Admin Profile', icon: User },
            { id: 'security', label: 'Security', icon: Shield },
            { id: 'notifications', label: 'Notifications', icon: Bell },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all ${
                activeTab === tab.id 
                  ? 'bg-red-50 text-red-600 font-semibold' 
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <tab.icon className="w-5 h-5 mr-3" />
              <span className="text-sm">{tab.label}</span>
              {activeTab === tab.id && <ChevronRight className="ml-auto w-4 h-4" />}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1">
          {activeTab === 'restaurant' && (
            <Card>
              <CardHeader 
                title="Restaurant Profile" 
                subtitle="This information will be displayed on the customer app."
                action={<Button size="sm"><Save className="w-4 h-4 mr-2" /> Save Changes</Button>}
              />
              <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="w-24 h-24 bg-red-50 border-2 border-dashed border-red-200 rounded-2xl flex items-center justify-center text-red-400 group cursor-pointer hover:border-red-400">
                    <Store size={32} />
                  </div>
                  <div className="flex-1 space-y-4">
                    <Input label="Restaurant Name" defaultValue="Aatreyo Restaurant" />
                    <Input label="Tagline" placeholder="e.g. Authentic Flavours of India" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Official Email" defaultValue="contact@zinkzaika.com" />
                  <Input label="Phone Number" defaultValue="+91 99887 76655" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Full Address</label>
                  <textarea 
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 min-h-[100px]"
                    defaultValue="Shop No. 42, Galaxy Plaza, Sector 18, Noida, Uttar Pradesh 201301"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <Input label="Opening Time" type="time" defaultValue="11:00" />
                   <Input label="Closing Time" type="time" defaultValue="23:00" />
                   <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Service Status</label>
                      <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400">
                        <option value="open">Open (Auto)</option>
                        <option value="closed">Manually Closed</option>
                      </select>
                   </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'orders' && (
            <Card>
              <CardHeader title="Order Settings" subtitle="Configure how orders are handled." />
              <CardContent className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Input 
                      label="Avg. Preparation Time (mins)" 
                      type="number" 
                      defaultValue="25" 
                    />
                    <Input 
                      label="Max. Orders per Slot" 
                      type="number" 
                      defaultValue="10" 
                    />
                 </div>
                 
                 <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Features</h4>
                    <div className="space-y-3">
                       {[
                         { id: 'dinein', label: 'Allow Dine-in Orders', enabled: true },
                         { id: 'takeaway', label: 'Allow Takeaway Orders', enabled: true },
                         { id: 'delivery', label: 'Allow Home Delivery', enabled: false },
                       ].map(feature => (
                         <div key={feature.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl">
                            <div>
                               <p className="text-sm font-bold text-slate-800">{feature.label}</p>
                               <p className="text-xs text-slate-500">Enable or disable this service for customers.</p>
                            </div>
                            <button className={`w-10 h-5 rounded-full relative transition-colors ${feature.enabled ? 'bg-green-500' : 'bg-slate-300'}`}>
                               <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${feature.enabled ? 'left-6' : 'left-1'}`} />
                            </button>
                         </div>
                       ))}
                    </div>
                 </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'profile' && (
            <Card>
              <CardHeader title="Admin Profile" subtitle="Manage your personal administrator details." />
              <CardContent className="space-y-6">
                 <div className="flex items-center space-x-6 pb-6 border-b border-slate-100">
                    <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-2xl">
                       AZ
                    </div>
                    <Button variant="outline" size="sm">Change Avatar</Button>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Full Name" defaultValue="Admin User" />
                    <Input label="Username" defaultValue="admin_zink" />
                 </div>
                 <Input label="Email Address" defaultValue="admin@zinkzaika.com" />
                 <Button>Update Profile</Button>
              </CardContent>
            </Card>
          )}
          
          {/* Add more tabs as needed, or placeholders */}
          {['tax', 'security', 'notifications'].includes(activeTab) && (
            <div className="h-64 flex items-center justify-center bg-white border border-slate-200 border-dashed rounded-2xl">
                <p className="text-slate-400">Settings for {activeTab} will be available soon.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
