import React, { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Plus, CheckSquare, Square, Trash2, ChevronDown, ChevronUp, ShieldAlert, ListChecks } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { can, PERMISSIONS } from '../lib/permissions'

export default function ProjectSOPs({ projectId }) {
  const { userProfile } = useAuth()
  const queryClient = useQueryClient()
  
  const [selectedSopId, setSelectedSopId] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [expandedSop, setExpandedSop] = useState(null) // Tracks which accordion is open

  // 1. Fetch Assigned SOPs + Progress + Items (All in one efficient query)
  const { data: projectSops, isLoading } = useQuery({
    queryKey: ['project_sops', projectId],
    queryFn: async () => {
      // Get the SOPs linked to this project
      const { data: links } = await supabase
        .from('project_sops')
        .select(`
          id, 
          sop:sops (
            id, title, category, description,
            items:sop_items (id, item_text, is_header, sort_order)
          )
        `)
        .eq('project_id', projectId)
        .order('created_at')

      // Get the ticks (Checkmarks)
      const { data: progress } = await supabase
        .from('project_item_completion')
        .select('sop_item_id, is_completed')
        .eq('project_id', projectId)
        .eq('is_completed', true)
      
      const completedIds = new Set(progress?.map(p => p.sop_item_id))

      // Merge and Sort
      return links.map(link => ({
        ...link,
        completedItemIds: completedIds,
        // Ensure items are sorted 1, 2, 3...
        items: link.sop.items ? link.sop.items.sort((a,b) => a.sort_order - b.sort_order) : []
      }))
    }
  })

  // 2. Fetch Library (For the dropdown)
  const { data: sopLibrary } = useQuery({
    queryKey: ['sops_library'],
    queryFn: async () => {
      const { data } = await supabase.from('sops').select('*').order('title')
      return data || []
    }
  })

  // --- ACTIONS ---

  const handleAddSOP = async () => {
    if (!selectedSopId) return
    const { error } = await supabase.from('project_sops').insert({
      project_id: projectId,
      sop_id: selectedSopId
    })
    
    if (error) alert(error.message)
    else {
      queryClient.invalidateQueries(['project_sops', projectId])
      setIsAdding(false)
      setSelectedSopId('')
    }
  }

  const removeSop = async (id) => {
    if (!window.confirm('Remove this checklist? Progress will be lost.')) return
    await supabase.from('project_sops').delete().eq('id', id)
    queryClient.invalidateQueries(['project_sops', projectId])
  }

  const toggleItem = async (itemId, isCurrentlyCompleted) => {
    // Optimistic UI Update (optional, but makes it feel fast)
    // We let React Query handle the refresh for accuracy

    if (isCurrentlyCompleted) {
      // Uncheck
      await supabase.from('project_item_completion').delete().match({
        project_id: projectId,
        sop_item_id: itemId
      })
    } else {
      // Check (Save WHO did it)
      await supabase.from('project_item_completion').insert({
        project_id: projectId,
        sop_item_id: itemId,
        is_completed: true,
        completed_by: userProfile.id,
        completed_at: new Date().toISOString()
      })
    }
    // Refresh data
    queryClient.invalidateQueries(['project_sops', projectId])
  }

  return (
    <div className="flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-bold text-slate-900 text-xl flex items-center gap-2">
          <ListChecks className="text-amber-500" /> Operational Checklists
        </h3>
        
        {/* Only Admin/Foreman can ADD checklists */}
        {can(userProfile?.role, PERMISSIONS.CAN_UPDATE_STATUS) && (
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-4 py-2 rounded text-sm flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus size={16} /> Add SOP
          </button>
        )}
      </div>

      {/* ADD DROPDOWN */}
      {isAdding && (
        <div className="flex gap-2 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-2">
          <select 
            className="flex-1 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-amber-500 outline-none"
            onChange={(e) => setSelectedSopId(e.target.value)}
            defaultValue=""
          >
            <option value="" disabled>Select a checklist to add...</option>
            {sopLibrary?.filter(s => !projectSops?.find(p => p.sop.id === s.id)).map(sop => (
              <option key={sop.id} value={sop.id}>{sop.title}</option>
            ))}
          </select>
          <button 
            onClick={handleAddSOP} 
            disabled={!selectedSopId}
            className="bg-slate-900 text-white font-bold px-6 rounded text-sm hover:bg-slate-800 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {/* ACTIVE CHECKLISTS */}
      <div className="space-y-4">
        {projectSops?.length === 0 && !isAdding && (
          <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
            <p className="text-slate-400 italic">No checklists active for this project.</p>
          </div>
        )}

        {projectSops?.map(link => {
          const isOpen = expandedSop === link.sop.id
          
          // Calculate Progress %
          const totalItems = link.items.filter(i => !i.is_header).length
          const checkedItems = link.items.filter(i => !i.is_header && link.completedItemIds.has(i.id)).length
          const percent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0

          return (
            <div key={link.id} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white transition-all">
              
              {/* HEADER BAR */}
              <div 
                className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${isOpen ? 'bg-slate-50 border-b border-slate-100' : 'hover:bg-slate-50'}`}
                onClick={() => setExpandedSop(isOpen ? null : link.sop.id)}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className={`p-1 rounded-full ${isOpen ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                    {isOpen ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                  </div>
                  
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-800">{link.sop.title}</h4>
                    {/* Progress Bar */}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden max-w-[150px]">
                        <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${percent}%` }}></div>
                      </div>
                      <span className="text-xs text-slate-400 font-bold">{percent}%</span>
                    </div>
                  </div>
                </div>

                {/* Remove Button (Admin Only) */}
                {can(userProfile?.role, PERMISSIONS.CAN_DELETE_PROJECT) && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeSop(link.id); }}
                    className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded transition-colors"
                    title="Remove Checklist"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              {/* CHECKLIST ITEMS */}
              {isOpen && (
                <div className="p-4 bg-white space-y-2">
                  {link.items.map(item => {
                    const isChecked = link.completedItemIds.has(item.id)

                    // 1. RENDER HEADER ROW
                    if (item.is_header) {
                      return (
                        <div key={item.id} className="mt-6 mb-2 pt-2 border-t border-slate-100 flex items-center gap-2 first:mt-0 first:pt-0 first:border-0">
                          {item.item_text.includes("SIGN-OFF") ? (
                            <ShieldAlert size={16} className="text-red-500" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          )}
                          <h5 className={`text-xs font-bold uppercase tracking-wider ${item.item_text.includes("SIGN-OFF") ? "text-red-600" : "text-slate-500"}`}>
                            {item.item_text}
                          </h5>
                        </div>
                      )
                    }

                    // 2. RENDER CHECKBOX ROW
                    return (
                      <div 
                        key={item.id} 
                        onClick={() => toggleItem(item.id, isChecked)}
                        className={`group flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-200 border border-transparent
                          ${isChecked ? 'bg-green-50/50' : 'hover:bg-slate-50 hover:border-slate-100'}`}
                      >
                        <div className={`mt-0.5 shrink-0 transition-colors ${isChecked ? 'text-green-500' : 'text-slate-300 group-hover:text-amber-400'}`}>
                          {isChecked ? <CheckSquare size={20} /> : <Square size={20} />}
                        </div>
                        <span className={`text-sm select-none leading-snug ${isChecked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          {item.item_text}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}