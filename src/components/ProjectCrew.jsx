import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { User, Plus, X, HardHat, Shield } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { can, PERMISSIONS } from '../lib/permissions'

export default function ProjectCrew({ projectId }) {
  const { userProfile } = useAuth()
  const queryClient = useQueryClient()
  const [isAdding, setIsAdding] = useState(false)
  const [selectedUser, setSelectedUser] = useState('')

  // 1. Fetch Crew assigned to THIS project
  const { data: assignedCrew } = useQuery({
    queryKey: ['project_crew', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_crew')
        .select('*, profile:profiles(*)')
        .eq('project_id', projectId)
      return data || []
    }
  })

  // 2. Fetch ALL available staff (for the dropdown)
  const { data: allStaff } = useQuery({
    queryKey: ['all_staff'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name')
      return data || []
    },
    enabled: isAdding // Only fetch when we open the "Add" menu
  })

  // Filter out people already assigned
  const availableStaff = allStaff?.filter(
    staff => !assignedCrew?.some(crew => crew.employee_id === staff.id)
  )

  const handleAddCrew = async () => {
    if (!selectedUser) return
    const { error } = await supabase.from('project_crew').insert({
      project_id: projectId,
      employee_id: selectedUser
    })
    
    if (error) alert(error.message)
    else {
      queryClient.invalidateQueries(['project_crew', projectId])
      setIsAdding(false)
      setSelectedUser('')
    }
  }

  const handleRemoveCrew = async (id) => {
    if (!confirm('Remove this person from the project?')) return
    await supabase.from('project_crew').delete().eq('id', id)
    queryClient.invalidateQueries(['project_crew', projectId])
  }

  // Helper for Role Icons
  const getRoleIcon = (role) => {
    if (role === 'admin') return <Shield size={12} className="text-red-500" />
    if (role === 'foreman') return <HardHat size={12} className="text-amber-500" />
    return null
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-900 flex items-center gap-2">
          <User size={18} className="text-amber-500" /> 
          Assigned Crew
        </h3>
        
        {/* Only Admin/Foreman can add crew */}
        {can(userProfile?.role, PERMISSIONS.CAN_DELETE_PROJECT) && (
          !isAdding ? (
            <button 
              onClick={() => setIsAdding(true)}
              className="text-xs font-bold text-slate-500 hover:text-amber-600 flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200"
            >
              <Plus size={14} /> Assign
            </button>
          ) : (
            <button 
              onClick={() => setIsAdding(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          )
        )}
      </div>

      {/* ADD CREW FORM */}
      {isAdding && (
        <div className="flex gap-2 mb-4 animate-in fade-in slide-in-from-top-1">
          <select 
            className="flex-1 p-2 text-sm border border-slate-300 rounded"
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
          >
            <option value="">Select Staff...</option>
            {availableStaff?.map(s => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.role})
              </option>
            ))}
          </select>
          <button 
            onClick={handleAddCrew}
            disabled={!selectedUser}
            className="bg-slate-900 text-white px-3 py-1 rounded text-sm font-bold disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {/* CREW LIST */}
      <div className="space-y-2">
        {assignedCrew?.length === 0 && (
          <p className="text-xs text-slate-400 italic">No crew assigned yet.</p>
        )}

        {assignedCrew?.map(item => (
          <div key={item.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                {item.profile?.full_name?.charAt(0) || '?'}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700 flex items-center gap-1">
                  {item.profile?.full_name}
                  {getRoleIcon(item.profile?.role)}
                </p>
                <p className="text-[10px] text-slate-400 uppercase">{item.profile?.role}</p>
              </div>
            </div>

            {/* Remove Button (Admin/Foreman Only) */}
            {can(userProfile?.role, PERMISSIONS.CAN_DELETE_PROJECT) && (
              <button 
                onClick={() => handleRemoveCrew(item.id)}
                className="text-slate-300 hover:text-red-500 p-1"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}