import React, { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { 
  LayoutDashboard, Folder, Users, LogOut, Book, Calendar, UserCog, 
  Menu, X, Clock // <--- 1. ADDED CLOCK ICON
} from 'lucide-react'

// 1. IMPORT CONFIG (For White-Labeling)
import { APP_CONFIG } from '../config'

// 2. IMPORT AUTH & PERMISSIONS
import { useAuth } from '../contexts/AuthContext'
import { can, PERMISSIONS } from '../lib/permissions'

export default function Layout() {
  const location = useLocation()
  const { userProfile } = useAuth()
  const userRole = userProfile?.role || 'crew'
  
  // STATE: Mobile Menu Toggle
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // EFFECT: Close mobile menu whenever the user clicks a link
  useEffect(() => {
    setIsMobileOpen(false)
  }, [location.pathname])

  const linkClass = (path) => `
    flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
    ${location.pathname === path 
      ? 'bg-amber-500 text-slate-900 font-bold' 
      : 'text-slate-400 hover:text-white hover:bg-slate-800'}
  `

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      
      {/* --- MOBILE HEADER (Visible only on small screens) --- */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 z-30 flex items-center justify-between px-4 shadow-md">
        <span className="text-amber-500 font-bold uppercase tracking-tighter">
          {APP_CONFIG.appName}
        </span>
        <button 
          onClick={() => setIsMobileOpen(true)}
          className="text-white p-2 hover:bg-slate-800 rounded"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* --- SIDEBAR --- */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none
        md:relative md:translate-x-0 
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        
        {/* Sidebar Header */}
        <div className="p-6 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-amber-500 tracking-tighter leading-tight uppercase">
              {APP_CONFIG.appName}
            </h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-2">
              {APP_CONFIG.tagline}
            </p>
          </div>
          
          {/* Close Button (Mobile Only) */}
          <button 
            onClick={() => setIsMobileOpen(false)}
            className="md:hidden text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
          <Link to="/" className={linkClass('/')}>
            <LayoutDashboard size={20} />
            Dashboard
          </Link>
          
          <Link to="/projects" className={linkClass('/projects')}>
            <Folder size={20} />
            Projects
          </Link>

          <Link to="/calendar" className={linkClass('/calendar')}>
            <Calendar size={20} />
            Schedule
          </Link>
          
          {/* CUSTOMERS - RESTRICTED */}
          {can(userRole, PERMISSIONS.CAN_MANAGE_CREW) && (
            <Link to="/customers" className={linkClass('/customers')}>
              <Users size={20} />
              Customers
            </Link>
          )}

          {/* TEAM MANAGEMENT - ADMIN ONLY */}
          {can(userRole, PERMISSIONS.CAN_DELETE_PROJECT) && (
            <Link to="/team" className={linkClass('/team')}>
              <UserCog size={20} />
              Team
            </Link>
          )}

          {/* --- 2. NEW TIMESHEETS LINK (ADMIN ONLY) --- */}
          {userRole === 'admin' && (
            <Link to="/timesheets" className={linkClass('/timesheets')}>
              <Clock size={20} />
              Timesheets
            </Link>
          )}

          <Link to="/sops" className={linkClass('/sops')}>
            <Book size={20} />
            SOP Library
          </Link>
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-800">
          <div className="px-4 pb-4 mb-2 border-b border-slate-800">
             <p className="text-xs text-slate-500 uppercase">Logged in as</p>
             <p className="font-bold text-amber-500 capitalize">{userRole}</p>
          </div>

          <button 
            onClick={() => supabase.auth.signOut()} 
            className="flex items-center gap-3 w-full px-4 py-3 text-slate-400 hover:text-red-400 transition-colors"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* --- OVERLAY BACKDROP (Mobile Only) --- */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 overflow-auto relative w-full pt-16 md:pt-0">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>

    </div>
  )
}