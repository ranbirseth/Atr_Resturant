import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createDrawerNavigator} from '@react-navigation/drawer';
import {Ionicons} from '@expo/vector-icons';

import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import OrdersScreen from '../screens/Orders/OrdersScreen';
import MenuCategoriesScreen from '../screens/MenuCategories/MenuCategoriesScreen';
import InventoryStockScreen from '../screens/InventoryStock/InventoryStockScreen';
import UserCouponsScreen from '../screens/UserCoupons/UserCouponsScreen';
import ReviewsAnalyticsScreen from '../screens/ReviewsAnalytics/ReviewsAnalyticsScreen';
import BillingScreen from '../screens/Billing/BillingScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import ConnectionStatus from '../components/ConnectionStatus';
import AppDrawerContent from './AppDrawerContent';
import ScreenFrame from './ScreenFrame';

const Drawer = createDrawerNavigator();

// Wrap a screen so its content clears the Android bottom navigation/gesture
// bar. Kept at module scope so the wrapped component identity is stable across
// renders (avoids remounting the screen).
function frameScreen(Screen) {
  function FramedScreen(props) {
    return (
      <ScreenFrame>
        <Screen {...props} />
      </ScreenFrame>
    );
  }
  FramedScreen.displayName = 'Framed' + (Screen.displayName || Screen.name || 'Screen');
  return FramedScreen;
}

const FramedDashboard = frameScreen(DashboardScreen);
const FramedOrders = frameScreen(OrdersScreen);
const FramedMenuCategories = frameScreen(MenuCategoriesScreen);
const FramedInventoryStock = frameScreen(InventoryStockScreen);
const FramedUserCoupons = frameScreen(UserCouponsScreen);
const FramedReviewsAnalytics = frameScreen(ReviewsAnalyticsScreen);
const FramedBilling = frameScreen(BillingScreen);
const FramedSettings = frameScreen(SettingsScreen);

// The 7 admin sections, opened from the hamburger drawer in the top header.
export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Drawer.Navigator
        initialRouteName="Dashboard"
        drawerContent={(props) => <AppDrawerContent {...props} />}
        screenOptions={{
          headerStyle: {backgroundColor: '#2c3e50'},
          headerTintColor: '#fff',
          headerTitleStyle: {fontWeight: '700'},
          headerRight: () => <ConnectionStatus compact />,
          drawerActiveTintColor: '#fff',
          drawerActiveBackgroundColor: '#2c3e50',
          drawerInactiveTintColor: '#33475b',
          drawerItemStyle: {borderRadius: 8},
          drawerLabelStyle: {fontSize: 15, fontWeight: '600'},
        }}>
        <Drawer.Screen
          name="Dashboard"
          component={FramedDashboard}
          options={{
            title: 'Dashboard',
            drawerIcon: ({color, size}) => (
              <Ionicons name="grid-outline" color={color} size={size} />
            ),
          }}
        />
        <Drawer.Screen
          name="Orders"
          component={FramedOrders}
          options={{
            title: 'Orders',
            drawerIcon: ({color, size}) => (
              <Ionicons name="receipt-outline" color={color} size={size} />
            ),
          }}
        />
        <Drawer.Screen
          name="MenuCategories"
          component={FramedMenuCategories}
          options={{
            title: 'Menu & Categories',
            drawerIcon: ({color, size}) => (
              <Ionicons name="restaurant-outline" color={color} size={size} />
            ),
          }}
        />
        <Drawer.Screen
          name="InventoryStock"
          component={FramedInventoryStock}
          options={{
            title: 'Inventory & Stock',
            drawerIcon: ({color, size}) => (
              <Ionicons name="cube-outline" color={color} size={size} />
            ),
          }}
        />
        <Drawer.Screen
          name="UserCoupons"
          component={FramedUserCoupons}
          options={{
            title: 'Users & Coupons',
            drawerIcon: ({color, size}) => (
              <Ionicons name="people-outline" color={color} size={size} />
            ),
          }}
        />
        <Drawer.Screen
          name="ReviewsAnalytics"
          component={FramedReviewsAnalytics}
          options={{
            title: 'Reviews & Analytics',
            drawerIcon: ({color, size}) => (
              <Ionicons name="stats-chart-outline" color={color} size={size} />
            ),
          }}
        />
        <Drawer.Screen
          name="Billing"
          component={FramedBilling}
          options={{
            title: 'Billing',
            drawerIcon: ({color, size}) => (
              <Ionicons name="card-outline" color={color} size={size} />
            ),
          }}
        />
        <Drawer.Screen
          name="Settings"
          component={FramedSettings}
          options={{
            title: 'Settings',
            drawerIcon: ({color, size}) => (
              <Ionicons name="settings-outline" color={color} size={size} />
            ),
          }}
        />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}