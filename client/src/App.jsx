import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Login from './pages/Login';
import Home from './pages/Home';
import FoodDetails from './pages/FoodDetails';
import Cart from './pages/Cart';
import CustomizeOrder from './pages/CustomizeOrder';
import OrderType from './pages/OrderType';
import Countdown from './pages/Countdown';

function App() {
  return (
    <AppProvider>
      <Router>
        <div className="min-h-screen bg-gray-50 text-gray-900">
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/home" element={<Home />} />
            <Route path="/food/:id" element={<FoodDetails />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/customize/:id" element={<CustomizeOrder />} />
            <Route path="/order-type" element={<OrderType />} />
            <Route path="/countdown" element={<Countdown />} />
          </Routes>
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
