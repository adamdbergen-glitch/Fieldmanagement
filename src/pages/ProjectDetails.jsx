import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { 
  ArrowLeft, MapPin, Clock, Phone, Navigation, 
  ShieldAlert, ListChecks, Truck, Info, Calendar,
  MessageSquare, Link as LinkIcon, Check
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import ProjectSOPs from '../components/ProjectSOPs'
import ProjectMaterials from '../components/ProjectMaterials'
import ProjectFiles from '../components/ProjectFiles'
import ProjectCrew from '../components/ProjectCrew'
import ProjectComments from '../components/ProjectComments'

// AUTH & PERMISSIONS
import { useAuth } from '../contexts/AuthContext'
import { can, PERMISSIONS } from '../lib/permissions'

export default function ProjectDetails() {
  const { id } = useParams() 
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { userProfile } = useAuth()
  const userRole = userProfile?.role || 'crew'

  // STATE
  const [activeTab, setActiveTab] = useState('overview')
  const [linkCopied, setLinkCopied] = useState(false)
  
  // NEW: Notification Counter (Starts at 0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [newMsgToast, setNewMsgToast] = useState(null)

  // 1. FETCH PROJECT
  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, customer:customers(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    }
  })

  // 2. REAL-TIME LISTENER (The Magic)
  useEffect(() => {
    const channel = supabase
      .channel('realtime-project-logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_comments',
          filter: `project_id=eq.${id}`
        },
        (payload) => {
          // A new message arrived!
          console.log('New Message:', payload)
          
          // A. Refresh the chat messages
          queryClient.invalidateQueries(['project_comments', id])

          // B. REFRESH PROJECT DATA (The Fix)
          // This ensures we know the project is now "Red" / flagged in the DB
          queryClient.invalidateQueries(['project', id]) 

          // C. Update Local Badge if not on the tab
          if (activeTab !== 'comments') {
            setUnreadCount((prev) => prev + 1) // Count up!
            
            setNewMsgToast("New message received!")
            setTimeout(() => setNewMsgToast(null), 4000)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, activeTab, queryClient])

  // Handle Tab Switching (Clears notification & Dashboard Alert)
  const handleTabClick = async (tabName) => {
    setActiveTab(tabName)
    
    if (tabName === 'comments') {
      setUnreadCount(0) // Clear the local red bubble

      // IF the project was flagged as "Needs Attention" on the dashboard, clear it now
      if (project?.has_new_client_message) {
        await supabase
          .from('projects')
          .update({ has_new_client_message: false })
          .eq('id', id)
        
        // Refresh project data to remove the flag locally
        queryClient.invalidateQueries(['project', id])
      }
    }
  }

  // ACTIONS
  const getGoogleMapsUrl = () => {
    if (!project?.customer?.address) return '#'
    const fullAddress = project.city ? `${project.customer.address}, ${project.city}` : project.customer.address
    return `http://googleusercontent.com/maps.google.com/search?q=${encodeURIComponent(fullAddress)}`
  }

  const handleDelete = async () => {
    if (!window.confirm('PERMANENTLY DELETE PROJECT? This cannot be undone.')) return
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) alert(error.message)
    else navigate('/projects')
  }

  const handleStatusUpdate = async (newStatus) => {
    const { error } = await supabase.from('projects').update({ status: newStatus }).eq('id', id)
    if (error) alert('Error updating status')
    else window.location.reload()
  }

  const copyPortalLink = () => {
    if (!project.access_token) return alert("Error: No access token found.")
    const url = `${window.location.origin}/portal/${project.access_token}`
    navigator.clipboard.writeText(url)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  if (isLoading) return <div className="p-10 text-center text-slate-500">Loading command center...</div>
  if (error) return <div className="p-10 text-red-500">Error: {error.message}</div>

  return (
    <div className="max-w-5xl mx-auto pb-20 md:pb-12 bg-slate-50 min-h-screen flex flex-col relative">
      
      {/* --- TOAST NOTIFICATION (Pop up at bottom) --- */}
      {newMsgToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <div>
              <p className="font-bold text-sm">Site Log Update</p>
              <p className="text-xs text-slate-300">New message just arrived.</p>
            </div>
            <button 
              onClick={() => handleTabClick('comments')}
              className="ml-4 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold px-3 py-1.5 rounded transition-colors"
            >
              View
            </button>
          </div>
        </div>
      )}

      {/* --- STICKY HEADER --- */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        
        {/* Top Row */}
        <div className="px-6 pt-6 pb-4">
          <button 
            onClick={() => navigate('/projects')}
            className="flex items-center text-slate-400 hover:text-slate-800 mb-4 text-xs font-bold uppercase tracking-wider transition-colors"
          >
            <ArrowLeft size={14} className="mr-1" /> Projects
          </button>

          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 leading-tight">
                {project.name}
              </h1>
              
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide border ${
                  project.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' :
                  project.status === 'In Progress' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                  'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {project.status}
                </span>
                
                {project.start_date && (
                  <span className="flex items-center gap-1 text-slate-500 font-medium text-xs">
                    <Calendar size={14} /> {format(parseISO(project.start_date), 'MMM d')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Client Bar */}
        {project.customer && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Client</p>
              <p className="font-bold text-slate-800 text-sm md:text-base">{project.customer.name}</p>
            </div>
            
            <div className="flex gap-2">
              <a 
                href={`tel:${project.customer.phone}`} 
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 hover:text-green-600 hover:border-green-300 shadow-sm transition-all"
              >
                <Phone size={18} />
              </a>
              <a 
                href={getGoogleMapsUrl()} 
                target="_blank" 
                rel="noreferrer" 
                className="w-10 h-10 flex items-center justify-center rounded-full bg-amber-500 text-slate-900 hover:bg-amber-400 shadow-sm transition-all"
              >
                <Navigation size={18} />
              </a>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="px-4 md:px-6 flex space-x-6 overflow-x-auto no-scrollbar bg-white">
          <button 
            onClick={() => handleTabClick('overview')}
            className={`pb-3 pt-3 text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-2 transition-colors ${
              activeTab === 'overview' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-800'
            }`}
          >
            <Info size={18} /> Overview
          </button>
          
          <button 
            onClick={() => handleTabClick('sops')}
            className={`pb-3 pt-3 text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-2 transition-colors ${
              activeTab === 'sops' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-800'
            }`}
          >
            <ListChecks size={18} /> Checklists
          </button>
          
          <button 
            onClick={() => handleTabClick('materials')}
            className={`pb-3 pt-3 text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-2 transition-colors ${
              activeTab === 'materials' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-800'
            }`}
          >
            <Truck size={18} /> Materials
          </button>

          {/* SITE LOG TAB with RED COUNT BUBBLE */}
          <button 
            onClick={() => handleTabClick('comments')}
            className={`relative pb-3 pt-3 text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-2 transition-colors ${
              activeTab === 'comments' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-800'
            }`}
          >
            <MessageSquare size={18} /> 
            Site Log
            
            {/* THE RED NOTIFICATION BUBBLE */}
            {unreadCount > 0 && (
              <span className="absolute top-1.5 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 ring-2 ring-white z-10 shadow-sm">
                <span className="text-[9px] font-bold text-white leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 -z-10"></span>
              </span>
            )}
          </button>
        </div>
      </div>

      {/* --- CONTENT AREA --- */}
      <div className="p-4 md:p-6 flex-1">

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            {/* Left Col */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 min-h-[160px]">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Clock size={14} /> Scope of Work
                </h3>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {project.name || "No description provided."}
                </p>
                {project.customer?.address && (
                   <div className="mt-6 pt-6 border-t border-slate-100">
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Site Address</p>
                     <div className="flex items-center gap-2 text-slate-700 font-medium">
                       <MapPin size={16} className="text-slate-400" />
                       {project.customer.address}, {project.city}
                     </div>
                   </div>
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                 <ProjectFiles projectId={id} />
              </div>
            </div>

            {/* Right Col */}
            <div className="space-y-6">

              {/* CLIENT PORTAL WIDGET */}
              <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/20 p-5 text-white">
                <h3 className="font-bold mb-2 flex items-center gap-2">
                  <Navigation size={18} /> Client Portal
                </h3>
                <p className="text-amber-100 text-xs mb-4">
                  Share this link so the client can track progress and upload photos without logging in.
                </p>
                
                <div className="flex gap-2">
                  <div className="flex-1 bg-black/10 rounded px-3 py-2 text-xs font-mono text-amber-100 truncate border border-white/10 select-all">
                    {project.access_token ? `${window.location.origin}/portal/${project.access_token}` : "Generating..."}
                  </div>
                  <button 
                    onClick={copyPortalLink}
                    className="bg-white text-amber-600 px-3 py-2 rounded font-bold text-xs hover:bg-amber-50 transition-colors flex items-center gap-1 shadow-sm"
                  >
                     {linkCopied ? <Check size={14} /> : <LinkIcon size={14} />} 
                     {linkCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              
              {/* JOB CONTROLS */}
              {can(userRole, PERMISSIONS.CAN_UPDATE_STATUS) && (
                <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 p-5 text-white">
                  <h3 className="font-bold mb-4 flex items-center gap-2 text-amber-400">
                    <ShieldAlert size={18} /> Job Controls
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {project.status !== 'In Progress' && (
                      <button onClick={() => handleStatusUpdate('In Progress')} className="bg-slate-700 hover:bg-slate-600 font-bold py-3 rounded-lg transition-colors border border-slate-600">Start Job</button>
                    )}
                    {project.status !== 'Completed' && (
                      <button onClick={() => handleStatusUpdate('Completed')} className="bg-green-600 hover:bg-green-500 font-bold py-3 rounded-lg transition-colors shadow-lg shadow-green-900/20">Mark Complete</button>
                    )}
                    <button onClick={() => handleStatusUpdate('Paused')} className="bg-slate-700 hover:bg-amber-600 text-slate-300 hover:text-white py-2 rounded-lg transition-colors text-sm font-bold">Pause / Hold</button>
                  </div>
                  {can(userRole, PERMISSIONS.CAN_DELETE_PROJECT) && (
                    <button onClick={handleDelete} className="mt-6 w-full text-red-400 hover:text-red-300 text-xs uppercase font-bold tracking-wider py-2">Delete Project</button>
                  )}
                </div>
              )}

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <ProjectCrew projectId={id} />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SOPs */}
        {activeTab === 'sops' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1 md:p-6">
               <ProjectSOPs projectId={id} />
             </div>
          </div>
        )}

        {/* TAB 3: MATERIALS */}
        {activeTab === 'materials' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1 md:p-6">
               <ProjectMaterials projectId={id} />
            </div>
          </div>
        )}

        {/* TAB 4: SITE LOG (COMMENTS) */}
        {activeTab === 'comments' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
               <ProjectComments projectId={id} />
            </div>
          </div>
        )}

      </div>
    </div>
  )
}