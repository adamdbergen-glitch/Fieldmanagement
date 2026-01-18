import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, parseISO } from 'date-fns'

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
      // FIX 1: Fetch from 'projects' and join 'customers'
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          customer:customers (name)
        `)
        // Filter for active statuses (Adjust these strings if your DB uses different casing)
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

  // Helper for status colors
  const getStatusColor = (status) => {
    const s = status?.toLowerCase() || ''
    if (s === 'completed') return 'bg-green-100 text-green-700'
    if (s.includes('progress')) return 'bg-amber-100 text-amber-800'
    if (s === 'scheduled' || s === 'new') return 'bg-blue-100 text-blue-700'
    return 'bg-slate-100 text-slate-600'
  }

  // Helper to format status text
  const formatStatus = (status) => {
    if (!status) return ''
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  }

  return (
    <div className="p-10 max-w-6xl mx-auto">
      {/* Header Section */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">
            Welcome back, <span className="font-bold">{userProfile?.full_name || 'Crew Member'}</span>
          </p>
        </div>
        <Link 
          to="/projects/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm transition-colors"
        >
          + New Project
        </Link>
      </div>

      {/* Stats / Quick View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-100">
          <h3 className="text-slate-400 text-sm font-medium uppercase">Active Projects</h3>
          <p className="text-3xl font-bold text-slate-800">{projects.length}</p>
        </div>
      </div>

      {/* Active Projects List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Upcoming & Active Jobs</h2>
          <Link to="/projects" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            View All &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No active jobs found. <Link to="/projects/new" className="text-blue-600 underline">Create one?</Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {projects.map((proj) => (
              <div key={proj.id} className="p-6 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                
                {/* Project Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    {/* FIX 2: Read customer name from the joined object */}
                    <h3 className="text-lg font-semibold text-slate-900">
                      {proj.customer?.name || 'Unknown Client'}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${getStatusColor(proj.status)}`}>
                      {formatStatus(proj.status)}
                    </span>
                  </div>
                  <p className="text-slate-500 text-sm mb-1">{proj.address}</p>
                  <p className="text-slate-400 text-xs">
                    {proj.name || 'No description provided'}
                  </p>
                </div>

                {/* Project Details (Dates) */}
                <div className="flex items-center gap-6 text-sm text-slate-600">
                  <div className="text-right">
                    <p className="text-xs text-slate-400 uppercase">Start Date</p>
                    <p className="font-medium">
                      {proj.start_date ? format(parseISO(proj.start_date), 'MMM d, yyyy') : 'TBD'}
                    </p>
                  </div>
                </div>

                {/* Action Button */}
                <div>
                  <Link 
                    to={`/projects/${proj.id}`}
                    className="inline-flex items-center justify-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none"
                  >
                    View
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