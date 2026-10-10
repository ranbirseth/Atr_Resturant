import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';

import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import OrdersScreen from '../screens/Orders/OrdersScreen';
import MenuScreen from '../screens/Menu/MenuScreen';
import CategoryScreen from '../screens/Category/CategoryScreen';
import UserCouponsScreen from '../screens/UserCoupons/UserCouponsScreen';
import ReviewsAnalyticsScreen from '../screens/ReviewsAnalytics/ReviewsAnalyticsScreen';
import BillingScreen from '../screens/Billing/BillingScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';

const Tab = createBottomTabNavigator();

// The 8 admin modules (placeholders until Phase 2 Step 2+).
export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName="Dashboard"
        screenOptions={{
          headerStyle: {backgroundColor: '#2c3e50'},
          headerTintColor: '#fff',
          headerTitleStyle: {fontWeight: '700'},
          tabBarLabelStyle: {fontSize: 9},
        }}>
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{title: 'Dashboard', tabBarLabel: 'Dashboard'}}
        />
        <Tab.Screen
          name="Orders"
          component={OrdersScreen}
          options={{title: 'Orders', tabBarLabel: 'Orders'}}
        />
        <Tab.Screen
          name="Menu"
          component={MenuScreen}
          options={{title: 'Menu', tabBarLabel: 'Menu'}}
        />
        <Tab.Screen
          name="Category"
          component={CategoryScreen}
          options={{title: 'Category', tabBarLabel: 'Category'}}
        />
        <Tab.Screen
          name="UserCoupons"
          component={UserCouponsScreen}
          options={{title: 'User & Coupons', tabBarLabel: 'Users'}}
        />
        <Tab.Screen
          name="ReviewsAnalytics"
          component={ReviewsAnalyticsScreen}
          options={{title: 'Reviews & Analytics', tabBarLabel: 'Reviews'}}
        />
        <Tab.Screen
          name="Billing"
          component={BillingScreen}
          options={{title: 'Billing', tabBarLabel: 'Billing'}}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{title: 'Settings', tabBarLabel: 'Settings'}}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
