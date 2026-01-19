import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Hammer, Loader2, AlertCircle } from 'lucide-react'
import { APP_CONFIG } from '../config'

export default function Login() {
  const navigate = useNavigate()
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Form State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('') // New state for name

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      if (isSignUp) {
        // --- SIGN UP LOGIC ---
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
              // Send the REAL name, not 'Admin User'
              full_name: fullName 
            } 
          }
        })
        
        if (error) throw error

        if (data.user) {
          alert("Account created successfully! You are now logged in.")
          navigate('/') 
        }
      } else {
        // --- LOGIN LOGIC ---
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/')
      }
    } catch (error) {
      console.error("Auth Error:", error)
      setErrorMsg(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      
      {/* Logo Area */}
      <div className="mb-8 text-center">
        <div className="bg-amber-500 w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-amber-500/20">
          <Hammer size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">{APP_CONFIG.appName}</h1>
        <p className="text-slate-500 text-sm">Field Management App</p>
      </div>

      <form onSubmit={handleAuth} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm border border-slate-100">
        <h2 className="text-xl font-bold mb-6 text-slate-800">
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h2>
        
        {/* Error Message Banner */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-sm text-red-600">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Full Name (Only show during Sign Up) */}
        {isSignUp && (
          <div className="mb-4 animate-in slide-in-from-top-2">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
            <input 
              required
              className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none" 
              placeholder="e.g. Adam Foreman" 
              value={fullName}
              onChange={(e) => setFullName(e.target.value)} 
            />
          </div>
        )}
        
        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
          <input 
            required
            type="email"
            className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none" 
            placeholder="name@company.com" 
            value={email}
            onChange={(e) => setEmail(e.target.value)} 
          />
        </div>

        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
          <input 
            required
            className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none" 
            type="password" 
            placeholder="••••••••" 
            value={password}
            onChange={(e) => setPassword(e.target.value)} 
          />
        </div>
        
        <button 
          disabled={loading} 
          className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-lg mb-4 hover:bg-slate-800 transition-colors flex justify-center items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : (isSignUp ? 'Sign Up' : 'Log In')}
        </button>

        <div className="text-center pt-4 border-t border-slate-50">
          <p className="text-sm text-slate-600">
            {isSignUp ? "Already have an account? " : "New to the team? "}
            <button 
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setErrorMsg('')
              }} 
              className="text-amber-600 font-bold hover:underline"
            >
              {isSignUp ? "Log In" : "Sign Up"}
            </button>
          </p>
        </div>
      </form>
    </div>
  )
}
