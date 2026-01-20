import React, { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Plus, Search, MapPin, Calendar, Briefcase, UserCheck, Folder as FolderIcon, MessageSquare } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
// Removed unused permissions import to keep code clean since we are using explicit role check
// import { can, PERMISSIONS } from '../lib/permissions' 

export default function Projects() {
  const { userProfile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  const [viewFilter, setViewFilter] = useState(
    userProfile?.role === 'crew' ? 'mine' : 'all'
  )
  const [searchTerm, setSearchTerm] = useState('')

  // FETCH PROJECTS
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects', viewFilter],
    queryFn: async () => {
      let query = supabase
        .from('projects')
        .select('*, customer:customers(*)')
        .order('has_new_client_message', { ascending: false }) // Alerts first
        .order('start_date', { ascending: true })

      if (viewFilter === 'mine') {
        query = supabase
          .from('projects')
          .select('*, customer:customers(*), project_crew!inner(employee_id)')
          .eq('project_crew.employee_id', userProfile.id)
          .order('has_new_client_message', { ascending: false })
          .order('start_date', { ascending: true })
      }

      const { data, error } = await query
      if (error) throw error
      return data
    }
  })

  // --- LIVE LISTENER (New Feature) ---
  useEffect(() => {
    console.log("Listening for dashboard updates...")
    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', // Listen for when the "New Message" flag flips
          schema: 'public',
          table: 'projects'
        },
        (payload) => {
          console.log('Project updated!', payload)
          queryClient.invalidateQueries(['projects'])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  // SEARCH FILTER
  const filteredProjects = projects?.filter(p => 
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.customer?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.city || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-700 border-green-200'
      case 'In Progress': return 'bg-amber-100 text-amber-800 border-amber-200'
      case 'Scheduled': return 'bg-blue-100 text-blue-700 border-blue-200'
      default: return 'bg-slate-100 text-slate-600 border-slate-200'
    }
  }

  if (isLoading) return <div className="p-10 text-center text-slate-500">Loading jobs...</div>
  if (error) return <div className="p-10 text-center text-red-500">Error: {error.message}</div>

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500 mt-1">Active jobs and estimates.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* VIEW TOGGLE */}
          <div className="bg-white p-1 rounded-lg border border-slate-200 flex shadow-sm">
            <button
              onClick={() => setViewFilter('all')}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${
                viewFilter === 'all' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Briefcase size={16} /> All Jobs
            </button>
            <button
              onClick={() => setViewFilter('mine')}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${
                viewFilter === 'mine' ? 'bg-amber-500 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <UserCheck size={16} /> My Jobs
            </button>
          </div>

          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input 
              type="text" placeholder="Search..." 
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none shadow-sm"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* RESTRICTED: Only Admin can see Add Project */}
          {userProfile?.role === 'admin' && (
            <Link to="/projects/new" className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors whitespace-nowrap">
              <Plus size={18} /> New Project
            </Link>
          )}
        </div>
      </div>

      {/* PROJECTS GRID */}
      {filteredProjects?.length === 0 ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
          <FolderIcon className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No projects found</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div 
              key={project.id} 
              onClick={() => navigate(`/projects/${project.id}`)}
              className={`relative bg-white rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col h-full 
                ${project.has_new_client_message ? 'border-red-400 ring-2 ring-red-400' : 'border-slate-200 hover:border-amber-400'}`}
            >
              {/* NEW MESSAGE ALERT BADGE */}
              {project.has_new_client_message && (
                <div className="absolute -top-3 -right-3 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md flex items-center gap-1 animate-pulse z-10 border border-white">
                  <MessageSquare size={12} fill="currentColor" />
                  Action Required
                </div>
              )}

              {/* Card Header */}
              <div className="p-6 border-b border-slate-100 flex-1">
                <div className="flex justify-between items-start mb-2">
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${getStatusColor(project.status)}`}>
                    {project.status || 'Unknown'}
                  </span>
                  {project.start_date && (
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                      <Calendar size={12} />
                      {format(parseISO(project.start_date), 'MMM d')}
                    </span>
                  )}
                </div>
                
                <h3 className="font-bold text-lg text-slate-900 group-hover:text-amber-600 transition-colors mb-1">
                  {project.name}
                </h3>
                
                {project.customer && (
                   <p className="text-sm text-slate-500 font-bold">{project.customer.name}</p>
                )}
              </div>

              {/* Card Footer */}
              <div className="px-6 py-4 bg-slate-50/50 flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <MapPin size={14} />
                  <span className="truncate max-w-[150px]">
                    {project.city || project.customer?.address || 'No location'}
                  </span>
                </div>
                
                {viewFilter === 'mine' && (
                  <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                    <UserCheck size={12} /> Assigned
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}