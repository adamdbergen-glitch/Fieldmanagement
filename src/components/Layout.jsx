import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LayoutDashboard, Folder, Users, LogOut, Book, Calendar, UserCog } from 'lucide-react'

// 1. IMPORT CONFIG (For White-Labeling)
import { APP_CONFIG } from '../config'

// 2. IMPORT AUTH & PERMISSIONS
import { useAuth } from '../contexts/AuthContext'
import { can, PERMISSIONS } from '../lib/permissions'

export default function Layout() {
  const location = useLocation()
  
  // 3. GET USER PROFILE & ROLE
  const { userProfile } = useAuth()
  const userRole = userProfile?.role || 'crew'

  const linkClass = (path) => `
    flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
    ${location.pathname === path 
      ? 'bg-amber-500 text-slate-900 font-bold' 
      : 'text-slate-400 hover:text-white hover:bg-slate-800'}
  `

  return (
    <div className="flex h-screen bg-slate-50">
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col transition-all duration-300">
        <div className="p-6">
          {/* DYNAMIC BRAND NAME (From Config) */}
          <h1 className="text-xl font-bold text-amber-500 tracking-tighter leading-tight uppercase">
            {APP_CONFIG.appName}
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-2">
            {APP_CONFIG.tagline}
          </p>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
          <Link to="/" className={linkClass('/')}>
            <LayoutDashboard size={20} />
            Dashboard
          </Link>
          
          <Link to="/projects" className={linkClass('/projects')}>
            <Folder size={20} />
            Projects
          </Link>

          {/* SCHEDULE (Everyone sees this) */}
          <Link to="/calendar" className={linkClass('/calendar')}>
            <Calendar size={20} />
            Schedule
          </Link>
          
          {/* CUSTOMERS - RESTRICTED (Admin & Foreman) */}
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

          <Link to="/sops" className={linkClass('/sops')}>
            <Book size={20} />
            SOP Library
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-800">
          {/* ROLE BADGE */}
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

      <main className="flex-1 overflow-auto relative">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}