import React, { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Plus, Search, MapPin, Calendar, Briefcase, UserCheck, Folder as FolderIcon, MessageSquare, LayoutGrid, Kanban as KanbanIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'

export default function Projects() {
  const { userProfile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  const isAdmin = userProfile?.role === 'admin'

  const [viewFilter, setViewFilter] = useState(isAdmin ? 'all' : 'mine')
  const [viewMode, setViewMode] = useState('board') // 'grid' or 'board'
  const [searchTerm, setSearchTerm] = useState('')

  // FETCH PROJECTS
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects', viewFilter],
    queryFn: async () => {
      let query = supabase
        .from('projects')
        .select('*, customer:customers(*)')
        .order('has_new_client_message', { ascending: false }) 
        .order('start_date', { ascending: true })

      // SECURITY: If they are NOT an admin, OR they selected "mine", force the crew filter
      if (!isAdmin || viewFilter === 'mine') {
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

  // --- LIVE LISTENER ---
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects' }, () => {
        queryClient.invalidateQueries(['projects'])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [queryClient])

  // --- DRAG AND DROP HANDLER ---
  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const newStatus = destination.droppableId

    // 1. Optimistic Update (Update Cache immediately)
    queryClient.setQueryData(['projects', viewFilter], (old) => {
      return old.map(p => p.id === draggableId ? { ...p, status: newStatus } : p)
    })

    // 2. Database Update
    const { error } = await supabase
      .from('projects')
      .update({ status: newStatus })
      .eq('id', draggableId)

    if (error) {
      alert("Failed to update status")
      queryClient.invalidateQueries(['projects']) // Revert on error
    }
  }

  // SEARCH FILTER
  const filteredProjects = projects?.filter(p => 
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.customer?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.city || '').toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const getStatusColor = (status) => {
    const s = status?.toLowerCase() || ''
    if (s === 'completed') return 'bg-green-100 text-green-700 border-green-200'
    if (s === 'in progress') return 'bg-amber-100 text-amber-800 border-amber-200'
    if (s === 'scheduled') return 'bg-blue-100 text-blue-700 border-blue-200'
    if (s === 'paused') return 'bg-red-100 text-red-700 border-red-200'
    return 'bg-slate-100 text-slate-600 border-slate-200'
  }

  // --- KANBAN COLUMNS CONFIG ---
  const columns = {
    'New': { title: 'New / Leads', color: 'border-slate-300 bg-slate-50' },
    'Scheduled': { title: 'Scheduled', color: 'border-blue-300 bg-blue-50' },
    'In Progress': { title: 'In Progress', color: 'border-amber-300 bg-amber-50' },
    'Paused': { title: 'Paused', color: 'border-red-300 bg-red-50' },
    'Completed': { title: 'Completed', color: 'border-green-300 bg-green-50' }
  }

  if (isLoading) return <div className="p-10 text-center text-slate-500">Loading jobs...</div>
  if (error) return <div className="p-10 text-center text-red-500">Error: {error.message}</div>

  return (
    <div className="max-w-[1600px] mx-auto p-6 md:p-8 h-[calc(100vh-80px)] flex flex-col">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500 mt-1">Manage active jobs and pipeline.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* VIEW TOGGLE */}
          <div className="bg-white p-1 rounded-lg border border-slate-200 flex shadow-sm">
            <button onClick={() => setViewMode('grid')} className={`px-3 py-2 rounded text-sm transition-all ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-600'}`} title="Grid View"><LayoutGrid size={18}/></button>
            <button onClick={() => setViewMode('board')} className={`px-3 py-2 rounded text-sm transition-all ${viewMode === 'board' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-600'}`} title="Board View"><KanbanIcon size={18}/></button>
          </div>

          {/* FILTER TOGGLE (Admin Only) */}
          {isAdmin && (
            <div className="bg-white p-1 rounded-lg border border-slate-200 flex shadow-sm">
              <button onClick={() => setViewFilter('all')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${viewFilter === 'all' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}><Briefcase size={16} /> All</button>
              <button onClick={() => setViewFilter('mine')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${viewFilter === 'mine' ? 'bg-amber-500 text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-900'}`}><UserCheck size={16} /> Mine</button>
            </div>
          )}

          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input type="text" placeholder="Search..." className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none shadow-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          {isAdmin && (
            <Link to="/projects/new" className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors whitespace-nowrap"><Plus size={18} /> New Project</Link>
          )}
        </div>
      </div>

      {/* --- CONTENT AREA --- */}
      {filteredProjects.length === 0 ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
          <FolderIcon className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900">No projects found</h3>
        </div>
      ) : viewMode === 'grid' ? (
        
        // --- GRID VIEW (Original) ---
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-10">
          {filteredProjects.map((project) => (
            <ProjectCard key={project.id} project={project} getStatusColor={getStatusColor} navigate={navigate} viewFilter={viewFilter} />
          ))}
        </div>

      ) : (
        
        // --- BOARD VIEW (Kanban) ---
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex h-full gap-4 overflow-x-auto pb-4">
            {Object.entries(columns).map(([columnId, colConfig]) => {
               // Filter projects for this column
               // Handle case-insensitive matching for status
               const colProjects = filteredProjects.filter(p => (p.status || 'New').toLowerCase() === columnId.toLowerCase())
               
               return (
                 <div key={columnId} className="flex flex-col min-w-[300px] w-[300px] bg-slate-50 rounded-xl border border-slate-200 flex-shrink-0 max-h-full">
                    <div className={`p-3 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center bg-white rounded-t-xl`}>
                      <span>{colConfig.title}</span>
                      <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full">{colProjects.length}</span>
                    </div>
                    
                    <Droppable droppableId={columnId}>
                      {(provided, snapshot) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className={`flex-1 p-2 overflow-y-auto space-y-3 transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50/50' : ''}`}
                        >
                          {colProjects.map((project, index) => (
                            <Draggable key={project.id} draggableId={project.id} index={index} isDragDisabled={!isAdmin}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={{ ...provided.draggableProps.style }}
                                  className={`bg-white p-4 rounded-lg border shadow-sm group hover:border-amber-400 transition-colors ${snapshot.isDragging ? 'shadow-xl ring-2 ring-amber-400 rotate-2' : 'border-slate-200'}`}
                                  onClick={() => navigate(`/projects/${project.id}`)}
                                >
                                  {project.has_new_client_message && (
                                    <div className="mb-2 flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded w-fit">
                                      <MessageSquare size={12} /> New Message
                                    </div>
                                  )}
                                  <h4 className="font-bold text-slate-900 mb-1">{project.customer?.name}</h4>
                                  <p className="text-sm text-slate-500 mb-2 truncate">{project.name}</p>
                                  <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <Calendar size={12} />
                                    {project.start_date ? format(parseISO(project.start_date), 'MMM d') : 'No Date'}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                 </div>
               )
            })}
          </div>
        </DragDropContext>
      )}
    </div>
  )
}

// --- SUB-COMPONENT FOR GRID CARD ---
function ProjectCard({ project, getStatusColor, navigate, viewFilter }) {
  return (
    <div 
      onClick={() => navigate(`/projects/${project.id}`)}
      className={`relative bg-white rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col h-full 
        ${project.has_new_client_message ? 'border-red-400 ring-2 ring-red-400' : 'border-slate-200 hover:border-amber-400'}`}
    >
      {project.has_new_client_message && (
        <div className="absolute -top-3 -right-3 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md flex items-center gap-1 animate-pulse z-10 border border-white">
          <MessageSquare size={12} fill="currentColor" /> Action
        </div>
      )}
      <div className="p-6 border-b border-slate-100 flex-1">
        <div className="flex justify-between items-start mb-2">
          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${getStatusColor(project.status)}`}>
            {project.status || 'Unknown'}
          </span>
          {project.start_date && (
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1"><Calendar size={12} /> {format(parseISO(project.start_date), 'MMM d')}</span>
          )}
        </div>
        <h3 className="font-bold text-lg text-slate-900 group-hover:text-amber-600 transition-colors mb-1">{project.name}</h3>
        {project.customer && <p className="text-sm text-slate-500 font-bold">{project.customer.name}</p>}
      </div>
      <div className="px-6 py-4 bg-slate-50/50 flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 text-slate-500">
          <MapPin size={14} />
          <span className="truncate max-w-[150px]">{project.city || project.customer?.address || 'No location'}</span>
        </div>
        {viewFilter === 'mine' && <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full"><UserCheck size={12} /> Assigned</span>}
      </div>
    </div>
  )
}
