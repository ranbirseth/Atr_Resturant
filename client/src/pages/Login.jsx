import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AppContext } from "../context/AppContext";
import { Coffee } from "lucide-react";

const Login = () => {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");
  const { login, checkUserExist, newUser, setNewUser } = useContext(AppContext);
  const navigate = useNavigate();

  const handleMobileBlur = async () => {
    if (mobile.length === 10) {
        await checkUserExist(mobile);
    } else {
        setNewUser(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !mobile) {
      setError("Please enter your name and mobile number");
      return;
    }
    const success = await login(name, mobile);
    if (success) navigate("/home");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bgMain px-6">
      
      {/* Premium Login Card */}
      <div className="w-full max-w-sm bg-bgModal rounded-[32px] border border-borderColor/50 shadow-2xl p-10 relative overflow-hidden">
        
        {/* Logo Section - Matching Navbar Style */}
        <div className="flex flex-col items-center mb-10">
          <img 
            src="/login-logo.png" 
            alt="Aatreyo Restaurant" 
            className="h-24 w-auto object-contain drop-shadow-xl mb-2 invert mix-blend-screen"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          {/* Fallback Text if Image Fails/Missing */}
          <div className="hidden flex-col items-center">
            <h1 className="text-3xl font-black text-primary tracking-tighter font-serif flex flex-col items-center">
              <span>Aatreyo</span>
              <span className="text-[10px] font-normal tracking-[0.2em] text-textSecondary uppercase -mt-1">Royal Indian Cuisine</span>
            </h1>
          </div>
          <p className="text-xs text-textSecondary mt-2 font-bold tracking-widest uppercase opacity-70">
            Guest Login
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 text-center text-xs font-bold text-error bg-error/10 py-3 rounded-xl border border-error/20 animate-in fade-in duration-300">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mb-2 block ml-1">
              Full Name
            </label>
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-5 py-4 rounded-xl bg-bgMain border border-borderColor/30 text-white placeholder-textSecondary focus:outline-none focus:border-primary/50 transition-all font-medium"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mb-2 block ml-1">
              Mobile Number
            </label>
            <input
              type="tel"
              placeholder="10 digit number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              onBlur={handleMobileBlur}
              className={`w-full px-5 py-4 rounded-xl bg-bgMain border transition-all focus:outline-none font-medium ${
                newUser === true ? 'border-success/50 focus:border-success' : 
                newUser === false ? 'border-primary/50 focus:border-primary' :
                'border-borderColor/30 focus:border-primary/50'
              } text-white placeholder-textSecondary`}
            />
            {newUser === true && (
              <div className="mt-3 text-[10px] text-success font-black uppercase tracking-widest bg-success/10 p-2 rounded-lg text-center border border-success/20 animate-in slide-in-from-top-2 duration-300">
                🎉 New Member Special
              </div>
            )}
            {newUser === false && (
              <p className="mt-3 text-[10px] text-primary/70 font-bold uppercase tracking-widest text-center">
                Welcome back, Highness 🏛️
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-4 rounded-xl bg-primary text-bgMain font-bold text-sm tracking-widest uppercase shadow-lg shadow-primary/10 hover:bg-primaryHover active:scale-[0.98] transition-all mt-4"
          >
            Begin Journey
          </button>
        </form>

        {/* Footer */}
        <div className="mt-10 pt-8 border-t border-borderColor/20">
          <p className="text-[10px] text-center text-textSecondary font-bold tracking-tight px-4 leading-relaxed">
            By entering, you celebrate our <br/>
            <span className="text-primary hover:underline cursor-pointer uppercase tracking-widest">Privacy & Royal Protocols</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
