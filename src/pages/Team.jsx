import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { User, Shield, Hammer, HardHat, Search, Plus, Clock, Copy, X, Check, Mail, DollarSign, Save } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { can, PERMISSIONS } from '../lib/permissions'

export default function Team() {
  const { userProfile } = useAuth()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  
  // Wage Editing State (New)
  const [editingWageId, setEditingWageId] = useState(null)
  const [tempWage, setTempWage] = useState('')

  // Invite Modal State
  const [isInviting, setIsInviting] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'crew' })
  const [isCopied, setIsCopied] = useState(false)

  // 1. Fetch Active Profiles
  const { data: team, isLoading: loadingTeam } = useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').order('full_name')
      return data || []
    }
  })

  // 2. Fetch Pending Invites (Only Admins/Foreman can see this)
  const { data: invites } = useQuery({
    queryKey: ['invites'],
    queryFn: async () => {
      try {
        const { data } = await supabase.from('team_invites').select('*')
        return data || []
      } catch {
        return []
      }
    },
    enabled: can(userProfile?.role, PERMISSIONS.CAN_DELETE_PROJECT) 
  })

  // --- ACTIONS ---

  // Save Wage (New)
  const handleWageSave = async (id) => {
    const { error } = await supabase.from('profiles').update({ wage: parseFloat(tempWage) }).eq('id', id)
    if (error) alert("Error saving wage: " + error.message)
    else {
      setEditingWageId(null)
      queryClient.invalidateQueries(['team'])
    }
  }

  // Update Role (Promote/Demote)
  const handleRoleChange = async (userId, newRole) => {
    if (userId === userProfile.id) return alert("You cannot change your own role.")
    
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) alert(error.message)
    else queryClient.invalidateQueries(['team'])
  }

  // Send Invite (Add to Pending List)
  const handleInvite = async (e) => {
    e.preventDefault()
    // Check if user already exists
    if (team.some(m => m.email === inviteForm.email)) return alert("User is already on the team!")
    
    const { error } = await supabase.from('team_invites').insert([inviteForm])
    if (error) alert(error.message)
    else {
      queryClient.invalidateQueries(['invites'])
      setInviteForm({ email: '', full_name: '', role: 'crew' })
      setIsInviting(false)
    }
  }

  // Delete Invite
  const handleDeleteInvite = async (email) => {
    if(!confirm("Cancel this invite?")) return
    await supabase.from('team_invites').delete().eq('email', email)
    queryClient.invalidateQueries(['invites'])
  }

  // Delete Active User
  const handleDeleteUser = async (id) => {
    if(!confirm("Remove this user permanently?")) return
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if (error) alert(error.message)
    else queryClient.invalidateQueries(['team'])
  }

  // Helper: Copy Signup Link
  const copyInviteLink = () => {
    const url = window.location.origin + "/signup" 
    navigator.clipboard.writeText(`Join the Paving Stone Pros app here: ${url}`)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  // --- UI HELPERS ---
  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin': return <Shield size={16} className="text-red-500" />
      case 'foreman': return <HardHat size={16} className="text-amber-500" />
      default: return <Hammer size={16} className="text-slate-400" />
    }
  }

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin': return 'bg-red-50 text-red-700 border-red-200'
      case 'foreman': return 'bg-amber-50 text-amber-800 border-amber-200'
      default: return 'bg-slate-50 text-slate-600 border-slate-200'
    }
  }

  const filteredTeam = team?.filter(member => 
    (member.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (member.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  )

  if (loadingTeam) return <div className="p-10 text-center text-slate-500">Loading roster...</div>

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-8">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Team & Wages</h1>
          <p className="text-slate-500 mt-1">Manage active crew, invites, and pay rates.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search crew..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Add Button (Admin Only) */}
          {can(userProfile?.role, PERMISSIONS.CAN_DELETE_PROJECT) && (
            <button 
              onClick={() => setIsInviting(true)}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap"
            >
              <Plus size={18} /> Add Member
            </button>
          )}
        </div>
      </div>

      {/* INVITE MODAL */}
      {isInviting && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">Invite New Member</h3>
              <button onClick={() => setIsInviting(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                <input 
                  required
                  className="w-full p-2 border border-slate-300 rounded focus:border-amber-500 outline-none"
                  placeholder="e.g. Mike Foreman"
                  value={inviteForm.full_name}
                  onChange={e => setInviteForm({...inviteForm, full_name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                <input 
                  type="email"
                  required
                  className="w-full p-2 border border-slate-300 rounded focus:border-amber-500 outline-none"
                  placeholder="mike@example.com"
                  value={inviteForm.email}
                  onChange={e => setInviteForm({...inviteForm, email: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Role</label>
                <select 
                  className="w-full p-2 border border-slate-300 rounded focus:border-amber-500 outline-none bg-white"
                  value={inviteForm.role}
                  onChange={e => setInviteForm({...inviteForm, role: e.target.value})}
                >
                  <option value="crew">Crew (Standard Access)</option>
                  <option value="foreman">Foreman (Can Manage Jobs)</option>
                  <option value="admin">Admin (Full Access)</option>
                </select>
              </div>

              <button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-3 rounded-lg mt-2 transition-colors">
                Send Invite
              </button>
            </form>
          </div>
        </div>
      )}

      {/* PENDING INVITES SECTION */}
      {invites?.length > 0 && (
        <div className="mb-8 animate-in slide-in-from-top-4 duration-500">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Pending Invites</h4>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {invites.map(invite => (
              <div key={invite.email} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
                <div className="flex items-center gap-3 opacity-70">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 border border-dashed border-slate-300">
                    <Clock size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-700">{invite.full_name}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Mail size={10} /> {invite.email}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded border border-slate-200">
                    Pending {invite.role}
                  </span>
                  
                  <button 
                    onClick={copyInviteLink}
                    className="text-amber-600 hover:text-amber-700 text-xs font-bold flex items-center gap-1 bg-white border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
                  >
                     {isCopied ? <Check size={14} /> : <Copy size={14} />} Copy Link
                  </button>

                  <button 
                    onClick={() => handleDeleteInvite(invite.email)} 
                    className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACTIVE TEAM LIST */}
      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Active Members</h4>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {filteredTeam?.length === 0 ? (
          <div className="p-10 text-center text-slate-400 italic">No active members found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTeam?.map(member => (
              <div key={member.id} className="p-4 md:p-6 flex flex-col md:flex-row items-center gap-4 hover:bg-slate-50 transition-colors">
                
                {/* User Info */}
                <div className="flex items-center gap-4 flex-1 w-full">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border border-slate-200 
                    ${member.role === 'admin' ? 'bg-red-50 text-red-600' : member.role === 'foreman' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                    {member.full_name ? member.full_name.charAt(0).toUpperCase() : <User size={20}/>}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      {member.full_name || 'Unnamed User'}
                      {member.id === userProfile.id && <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-bold">YOU</span>}
                    </h3>
                    <p className="text-sm text-slate-500 flex items-center gap-1">
                       <Mail size={12} /> {member.email}
                    </p>
                  </div>
                </div>

                {/* Role Badge & Controls */}
                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                  
                  {/* WAGE SECTION (New) */}
                  {userProfile.role === 'admin' && (
                    <div className="min-w-[140px] text-right">
                      {editingWageId === member.id ? (
                        <div className="flex items-center gap-1 bg-white border border-amber-500 rounded p-1 shadow-sm">
                          <span className="text-slate-400 text-xs">$</span>
                          <input 
                            type="number" 
                            autoFocus 
                            className="w-16 text-sm font-bold outline-none"
                            value={tempWage}
                            onChange={e => setTempWage(e.target.value)}
                          />
                          <button onClick={() => handleWageSave(member.id)} className="text-green-600 hover:bg-green-50 rounded p-1"><Check size={14}/></button>
                          <button onClick={() => setEditingWageId(null)} className="text-red-400 hover:bg-red-50 rounded p-1"><X size={14}/></button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => { setEditingWageId(member.id); setTempWage(member.wage || ''); }}
                          className="flex items-center gap-1 text-slate-600 hover:text-amber-600 font-mono font-bold text-sm bg-slate-50 hover:bg-amber-50 px-3 py-1.5 rounded transition-colors border border-slate-200"
                          title="Click to Edit Wage"
                        >
                          <DollarSign size={12} />
                          {member.wage ? Number(member.wage).toFixed(2) : '0.00'}/hr
                        </button>
                      )}
                    </div>
                  )}

                  {/* Role Badge */}
                  <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border flex items-center gap-2 ${getRoleBadge(member.role)}`}>
                    {getRoleIcon(member.role)}
                    {member.role}
                  </div>

                  {/* Delete/Role Change (Admin Only) */}
                  {can(userProfile?.role, PERMISSIONS.CAN_DELETE_PROJECT) && member.id !== userProfile.id && (
                    <div className="flex items-center gap-2">
                      <select 
                        className="p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-600 focus:border-amber-500 outline-none cursor-pointer hover:border-slate-300 transition-colors"
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value)}
                      >
                        <option value="crew">Crew</option>
                        <option value="foreman">Foreman</option>
                        <option value="admin">Admin</option>
                      </select>
                      
                      <button 
                        onClick={() => handleDeleteUser(member.id)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  )}
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}