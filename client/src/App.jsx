import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, AppContext } from './context/AppContext';
import Login from './pages/Login';
import Home from './pages/Home';
import FoodDetails from './pages/FoodDetails';
import Cart from './pages/Cart';
import CustomizeOrder from './pages/CustomizeOrder';
import OrderType from './pages/OrderType';
import Countdown from './pages/Countdown';

const RequireAuth = ({ children }) => {
  const { user } = useContext(AppContext);
  const location = useLocation();

  if (!user?._id) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

function App() {
  return (
    <AppProvider>
      <Router>
        <div className="min-h-screen bg-gray-50 text-gray-900">
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/food/:id" element={<RequireAuth><FoodDetails /></RequireAuth>} />
            <Route path="/cart" element={<RequireAuth><Cart /></RequireAuth>} />
            <Route path="/customize/:id" element={<RequireAuth><CustomizeOrder /></RequireAuth>} />
            <Route path="/order-type" element={<RequireAuth><OrderType /></RequireAuth>} />
            <Route path="/countdown" element={<RequireAuth><Countdown /></RequireAuth>} />
          </Routes>
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
