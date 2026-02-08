import React, { createContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import API_URL from '../config';

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
    const [menuItems, setMenuItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [cart, setCart] = useState([]);
    const [coupon, setCoupon] = useState(null); // { code, discountType, value, discountAmount }
    const [loading, setLoading] = useState(false);
    const [currentOrderId, setCurrentOrderId] = useState(localStorage.getItem('currentOrderId') || null);
    const [newUser, setNewUser] = useState(null); // null, true, false

    useEffect(() => {
        if (currentOrderId) {
            localStorage.setItem('currentOrderId', currentOrderId);
        } else {
            localStorage.removeItem('currentOrderId');
        }
    }, [currentOrderId]);

    useEffect(() => {
        fetchMenuItems();
        fetchCategories();
    }, []);

    useEffect(() => {
        localStorage.setItem('user', JSON.stringify(user));
    }, [user]);

    const fetchMenuItems = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_URL}/items`);
            setMenuItems(res.data);
            if (res.data.length === 0) {
                 await axios.post(`${API_URL}/items/seed`);
                 const seeded = await axios.get(`${API_URL}/items`);
                 setMenuItems(seeded.data);
            }
        } catch (error) {
            console.error("Error fetching menu:", error);
        }
        setLoading(false);
    };

    const fetchCategories = async () => {
        try {
            const res = await axios.get(`${API_URL}/categories`);
            setCategories(res.data);
        } catch (error) {
            console.error("Error fetching categories:", error);
        }
    };

    const login = useCallback(async (name, mobile) => {
        try {
            const res = await axios.post(`${API_URL}/auth/login`, { name, mobile });
            setUser(res.data);
            return true;
        } catch (error) {
            console.error("Login Error:", error);
            return false;
        }
    }, [setUser]);

    const checkUserExist = useCallback(async (mobile) => {
        try {
            const res = await axios.post(`${API_URL}/auth/check`, { mobile });
            setNewUser(!res.data.exists);
            return res.data.exists;
        } catch (error) {
            console.error("Check User Error:", error);
            setNewUser(null);
            return false;
        }
    }, []);

    const addToCart = useCallback((item, quantity = 1, customizations = []) => {
        setCart(prev => {
            // Check if same item with same customizations exists
            const existingIndex = prev.findIndex(cartItem => 
                cartItem._id === item._id && 
                JSON.stringify(cartItem.customizations) === JSON.stringify(customizations)
            );

            if (existingIndex > -1) {
                const newCart = [...prev];
                newCart[existingIndex].quantity += quantity;
                return newCart;
            } else {
                return [...prev, { ...item, quantity, customizations }];
            }
        });
    }, []);

    const removeFromCart = useCallback((index) => {
        setCart(prev => prev.filter((_, i) => i !== index));
    }, []);
    
    const clearCart = useCallback(() => setCart([]), []);

    const getCartTotal = useCallback(() => {
        return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    }, [cart]);

    const applyCoupon = useCallback(async (code) => {
        try {
            const cartTotal = getCartTotal();
            const res = await axios.post(`${API_URL}/coupons/validate`, { code, cartTotal });
            if (res.data.success) {
                setCoupon({
                    code: res.data.code,
                    discountType: res.data.discountType,
                    value: res.data.value,
                    discountAmount: res.data.discountAmount
                });
                return { success: true, message: res.data.message };
            }
        } catch (error) {
            console.error("Coupon Error:", error);
            return { success: false, message: error.response?.data?.message || 'Invalid Coupon' };
        }
    }, [getCartTotal]);

    const removeCoupon = useCallback(() => setCoupon(null), []);

    const getFinalTotal = useCallback(() => {
        const subTotal = getCartTotal();
        const discount = coupon ? coupon.discountAmount : 0;
        return subTotal - discount > 0 ? subTotal - discount : 0;
    }, [getCartTotal, coupon]);

    const placeOrder = useCallback(async (orderData) => {
        try {
            const res = await axios.post(`${API_URL}/orders`, orderData);
            clearCart();
            setCurrentOrderId(res.data._id); // Save current order ID
            return res.data;
        } catch (error) {
            console.error("Order Error:", error);
            throw error;
        }
    }, [clearCart]);

    const value = React.useMemo(() => ({
        user,
        setUser,
        menuItems,
        categories,
        selectedCategory,
        setSelectedCategory,
        cart,
        addToCart,
        removeFromCart,
        clearCart,
        getCartTotal,
        coupon,
        applyCoupon,
        removeCoupon,
        getFinalTotal,
        login,
        checkUserExist,
        placeOrder,
        currentOrderId,
        loading,
        newUser,
        setNewUser
    }), [user, menuItems, categories, selectedCategory, setSelectedCategory, cart, coupon, currentOrderId, loading, addToCart, removeFromCart, clearCart, getCartTotal, applyCoupon, removeCoupon, getFinalTotal, login, checkUserExist, placeOrder, newUser]);

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};
