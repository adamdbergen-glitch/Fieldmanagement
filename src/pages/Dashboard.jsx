import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, parseISO } from 'date-fns'
import TimeClock from '../components/TimeClock' // <--- NEW IMPORT

export default function Dashboard() {
  const { userProfile } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchActiveProjects()
  }, [])

  async function fetchActiveProjects() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          customer:customers (name)
        `)
        .in('status', ['New', 'scheduled', 'in_progress', 'paused', 'In Progress']) 
        .order('start_date', { ascending: true, nullsFirst: false })
        .limit(5)

      if (error) throw error
      setProjects(data || [])
    } catch (error) {
      console.error('Error fetching projects:', error.message)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    const s = status?.toLowerCase() || ''
    if (s === 'completed') return 'bg-green-100 text-green-700'
    if (s.includes('progress')) return 'bg-amber-100 text-amber-800'
    if (s === 'scheduled' || s === 'new') return 'bg-blue-100 text-blue-700'
    return 'bg-slate-100 text-slate-600'
  }

  const formatStatus = (status) => {
    if (!status) return ''
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  }

  return (
    <div className="p-4 md:p-10 max-w-6xl mx-auto space-y-8">
      
      {/* 1. HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">
            Welcome back, <span className="font-bold text-slate-700">{userProfile?.full_name || 'Crew Member'}</span>
          </p>
        </div>
        <Link 
          to="/projects/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-sm transition-colors font-bold"
        >
          + New Project
        </Link>
      </div>

      {/* 2. TIME CLOCK (NEW) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <TimeClock />
        </div>
        
        {/* STATS CARD (Moved here to sit next to clock on large screens) */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center">
          <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Active Projects</h3>
          <p className="text-4xl font-black text-slate-800">{projects.length}</p>
          <p className="text-slate-400 text-sm mt-1">Scheduled or In Progress</p>
        </div>

        {/* Placeholder for Weather or other stats */}
        <div className="hidden lg:flex lg:col-span-1 bg-slate-50 p-6 rounded-xl border border-dashed border-slate-300 items-center justify-center text-slate-400 text-sm font-medium">
          Weather Widget Coming Soon
        </div>
      </div>

      {/* 3. ACTIVE PROJECTS LIST */}
      <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800">Upcoming & Active Jobs</h2>
          <Link to="/projects" className="text-blue-600 hover:text-blue-800 text-sm font-bold">
            View All &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No active jobs found. <Link to="/projects/new" className="text-blue-600 font-bold hover:underline">Create one?</Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {projects.map((proj) => (
              <div key={proj.id} className="p-6 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-6 group">
                
                {/* Project Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {proj.customer?.name || 'Unknown Client'}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${getStatusColor(proj.status)} bg-opacity-50`}>
                      {formatStatus(proj.status)}
                    </span>
                  </div>
                  <p className="text-slate-600 text-sm mb-1 font-medium">{proj.address}</p>
                  <p className="text-slate-400 text-xs italic">
                    {proj.name || 'No description provided'}
                  </p>
                </div>

                {/* Project Details (Dates) */}
                <div className="flex items-center gap-6 text-sm text-slate-600">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Date</p>
                    <p className="font-bold text-slate-700">
                      {proj.start_date ? format(parseISO(proj.start_date), 'MMM d, yyyy') : 'TBD'}
                    </p>
                  </div>
                </div>

                {/* Action Button */}
                <div>
                  <Link 
                    to={`/projects/${proj.id}`}
                    className="inline-flex items-center justify-center px-4 py-2 border border-slate-200 shadow-sm text-sm font-bold rounded-lg text-slate-600 bg-white hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all"
                  >
                    View Details
                  </Link>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}