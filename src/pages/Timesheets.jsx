import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, parseISO, differenceInMinutes, addDays, startOfMonth, endOfMonth, setDate, isFuture, isBefore } from 'date-fns' // <--- Added validation imports
import { Clock, Save, Loader2, Calendar, User, Edit2, X, Settings, MapPin, Plus, Briefcase, AlertTriangle, AlertCircle } from 'lucide-react'

export default function Timesheets() {
  const queryClient = useQueryClient()
  const { user, userProfile, loading: authLoading } = useAuth()
  
  const [editingLog, setEditingLog] = useState(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // --- 1. FETCH PAYROLL SETTINGS ---
  const { data: payrollConfig } = useQuery({
    queryKey: ['payroll_config'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('setting_value').eq('setting_key', 'payroll_config').single()
      return data?.setting_value || { 
        frequency: 'biweekly', 
        anchor_date: '2025-01-01', 
        cutoff_day: 0, 
        auto_clockout: false 
      }
    }
  })

  // --- FETCH LISTS ---
  const { data: team } = useQuery({ 
    queryKey: ['team_list'], 
    queryFn: async () => (await supabase.from('profiles').select('id, full_name').order('full_name')).data 
  })
  
  const { data: projects } = useQuery({ 
    queryKey: ['project_list'], 
    queryFn: async () => (await supabase.from('projects').select('id, name').neq('status', 'Completed').order('name')).data 
  })

  // --- 2. FETCH LOGS ---
  const { data: logs, isLoading: isQueryLoading } = useQuery({
    queryKey: ['time_logs', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      let query = supabase
        .from('time_logs')
        .select(`*, profiles:user_id ( full_name, email ), project:projects ( name )`)
        .order('clock_in_time', { ascending: false })

      if (userProfile?.role !== 'admin') {
        query = query.eq('user_id', user.id)
      }
      
      const { data, error } = await query
      if (error) throw error
      return data
    }
  })

  // --- 3. MUTATIONS ---
  const createLogMutation = useMutation({
    mutationFn: async (newData) => {
      const { error } = await supabase.from('time_logs').insert(newData)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries(['time_logs']); setIsCreating(false) }
  })

  const updateLogMutation = useMutation({
    mutationFn: async (updatedData) => {
      const { error } = await supabase.from('time_logs')
        .update({
          clock_in_time: updatedData.clock_in_time,
          clock_out_time: updatedData.clock_out_time,
          admin_notes: updatedData.admin_notes,
          project_id: updatedData.project_id
        }).eq('id', updatedData.id)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries(['time_logs']); setEditingLog(null) }
  })

  const saveSettingsMutation = useMutation({
    mutationFn: async (newConfig) => {
      const { error } = await supabase.from('app_settings')
        .upsert({ setting_key: 'payroll_config', setting_value: newConfig }, { onConflict: 'setting_key' })
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries(['payroll_config']); setShowSettings(false) }
  })

  // --- HELPER: Pay Period ---
  const getPayPeriodLabel = (dateString) => {
    if (!payrollConfig) return 'Loading...'
    const date = parseISO(dateString)
    
    if (payrollConfig.frequency === 'monthly') {
      return format(date, 'MMMM yyyy')
    }

    if (payrollConfig.frequency === 'semimonthly') {
      const day = date.getDate()
      const monthStart = startOfMonth(date)
      const monthEnd = endOfMonth(date)
      return day <= 15 
        ? `${format(monthStart, 'MMM 1')} - ${format(setDate(date, 15), 'MMM 15, yyyy')}`
        : `${format(setDate(date, 16), 'MMM 16')} - ${format(monthEnd, 'MMM d, yyyy')}`
    }

    const anchor = parseISO(payrollConfig.anchor_date)
    const freqDays = payrollConfig.frequency === 'weekly' ? 7 : 14 
    const diffTime = date.getTime() - anchor.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 3600 * 24))
    const periodIndex = Math.floor(diffDays / freqDays)
    const periodStart = addDays(anchor, periodIndex * freqDays)
    const periodEnd = addDays(periodStart, freqDays - 1)

    return `${format(periodStart, 'MMM d')} - ${format(periodEnd, 'MMM d, yyyy')}`
  }

  const groupedLogs = logs?.reduce((groups, log) => {
    const period = getPayPeriodLabel(log.clock_in_time)
    if (!groups[period]) groups[period] = []
    groups[period].push(log)
    return groups
  }, {})

  // --- FORM HANDLER (GUARDRAILS + TIMEZONE FIX) ---
  const handleFormSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    // 1. Get raw input values
    const clockInVal = formData.get('clock_in')
    const clockOutVal = formData.get('clock_out')
    
    // 2. Convert to Date objects
    const start = new Date(clockInVal)
    const end = clockOutVal ? new Date(clockOutVal) : null
    
    // 3. GUARDRAILS
    if (isFuture(start)) {
      return alert("Error: Clock In time cannot be in the future.")
    }
    if (end && isFuture(end)) {
      return alert("Error: Clock Out time cannot be in the future.")
    }
    if (end && isBefore(end, start)) {
      return alert("Error: Clock Out time cannot be BEFORE Clock In time (Negative hours).")
    }

    // 4. PREPARE PAYLOAD (Convert to ISO UTC)
    // The browser automatically handles the timezone conversion when we call .toISOString() on a Date object created from local input.
    const payload = {
      clock_in_time: start.toISOString(),
      clock_out_time: end ? end.toISOString() : null,
      admin_notes: formData.get('notes'),
      project_id: formData.get('project_id')
    }

    if (isCreating) {
      createLogMutation.mutate({ ...payload, user_id: formData.get('user_id') })
    } else {
      updateLogMutation.mutate({ ...payload, id: editingLog.id })
    }
  }

  if (authLoading || isQueryLoading) return <div className="p-12 text-center"><Loader2 className="animate-spin inline text-amber-500 mr-2"/> Loading...</div>
  if (!logs) return <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl m-8"><p className="text-slate-500">Unable to load timesheets.</p></div>

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Timesheets</h1>
          <p className="text-slate-500">
            {userProfile?.role === 'admin' ? 'Review employee hours & payroll.' : 'Your work history.'}
          </p>
        </div>
        
        {userProfile?.role === 'admin' && (
          <div className="flex gap-2">
            <button 
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg font-bold shadow-sm hover:bg-slate-800 transition-colors"
            >
              <Plus size={18} /> Add Entry
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-blue-600 font-bold transition-colors shadow-sm"
            >
              <Settings size={18} /> Settings
            </button>
          </div>
        )}
      </div>

      <div className="space-y-8">
        {groupedLogs && Object.keys(groupedLogs).map((period) => (
          <div key={period} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <Calendar size={18} className="text-amber-500"/> 
                Period: {period}
              </h3>
              <span className="text-xs font-bold uppercase text-slate-400 bg-slate-200 px-2 py-1 rounded">
                {groupedLogs[period].length} Shifts
              </span>
            </div>
            
            <table className="w-full text-left border-collapse">
              <thead className="bg-white border-b border-slate-100">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase">Person / Project</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase hidden md:table-cell">Date</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase">In / Out</th>
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase">Total</th>
                  {userProfile?.role === 'admin' && <th className="p-4 text-xs font-bold text-slate-400 uppercase text-right">Edit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedLogs[period].map(log => {
                   const durationMinutes = log.clock_out_time ? differenceInMinutes(parseISO(log.clock_out_time), parseISO(log.clock_in_time)) : 0
                   const hours = Math.floor(durationMinutes / 60)
                   const mins = durationMinutes % 60
                   
                   return (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                            {log.profiles?.full_name?.charAt(0) || <User size={12}/>}
                          </div>
                          <div>
                            <span className="font-medium text-slate-900 text-sm block">{log.profiles?.full_name}</span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Briefcase size={10}/> {log.project?.name || 'No Project'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600 text-sm font-mono hidden md:table-cell">
                        {format(parseISO(log.clock_in_time), 'EEE, MMM d')}
                      </td>
                      <td className="p-4 text-sm">
                        <div className="md:hidden text-xs text-slate-400 mb-1">
                            {format(parseISO(log.clock_in_time), 'MMM d')}
                        </div>
                        <span className="text-green-700 font-bold">{format(parseISO(log.clock_in_time), 'h:mm a')}</span>
                        {log.gps_in_lat && (
                          <a href={`https://www.google.com/maps?q=${log.gps_in_lat},${log.gps_in_long}`} target="_blank" rel="noreferrer" className="inline-block ml-1 text-slate-300 hover:text-blue-500">
                            <MapPin size={12} />
                          </a>
                        )}
                        <span className="text-slate-300 mx-2">-</span>
                        {log.clock_out_time ? (
                          <>
                            <span className="text-slate-700">{format(parseISO(log.clock_out_time), 'h:mm a')}</span>
                            {log.gps_out_lat && (
                              <a href={`https://www.google.com/maps?q=${log.gps_out_lat},${log.gps_out_long}`} target="_blank" rel="noreferrer" className="inline-block ml-1 text-slate-300 hover:text-blue-500">
                                <MapPin size={12} />
                              </a>
                            )}
                          </>
                        ) : (
                          <span className="text-amber-600 font-bold text-xs uppercase bg-amber-50 px-2 py-0.5 rounded">Active</span>
                        )}
                      </td>
                      <td className="p-4 font-bold text-slate-800 text-sm">
                        {log.clock_out_time ? `${hours}h ${mins}m` : '-'}
                      </td>
                      {userProfile?.role === 'admin' && (
                        <td className="p-4 text-right">
                          <button onClick={() => setEditingLog(log)} className="text-slate-300 hover:text-blue-600"><Edit2 size={16} /></button>
                        </td>
                      )}
                    </tr>
                   )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Payroll Configuration</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              saveSettingsMutation.mutate({ 
                frequency: formData.get('frequency'), 
                anchor_date: formData.get('anchor_date'),
                cutoff_day: formData.get('cutoff_day'),
                auto_clockout: formData.get('auto_clockout') === 'on'
              })
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Pay Frequency</label>
                  <select name="frequency" defaultValue={payrollConfig?.frequency} className="w-full p-2 border border-slate-300 rounded bg-white">
                    <option value="weekly">Weekly (Every 7 Days)</option>
                    <option value="biweekly">Bi-Weekly (Every 14 Days)</option>
                    <option value="semimonthly">Semi-Monthly (1st-15th, 16th-End)</option>
                    <option value="monthly">Monthly (Calendar Month)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Anchor Date</label>
                  <input type="date" name="anchor_date" defaultValue={payrollConfig?.anchor_date} className="w-full p-2 border border-slate-300 rounded" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Cutoff Offset</label>
                    <input type="number" name="cutoff_day" defaultValue={payrollConfig?.cutoff_day || 0} className="w-full p-2 border border-slate-300 rounded" />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input type="checkbox" name="auto_clockout" defaultChecked={payrollConfig?.auto_clockout} className="w-5 h-5 accent-amber-500" />
                    <label className="text-sm font-bold text-slate-700">Auto-Close @ 23:59</label>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-6">
                <button type="button" onClick={() => setShowSettings(false)} className="flex-1 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-slate-900 text-white font-bold rounded hover:bg-slate-800">Save Config</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {(editingLog || isCreating) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {isCreating ? 'Add Manual Entry' : 'Edit Time Log'}
              </h3>
              <button onClick={() => { setEditingLog(null); setIsCreating(false); }}>
                <X className="text-slate-400 hover:text-slate-700"/>
              </button>
            </div>
            
            {/* NEW FORM HANDLER */}
            <form onSubmit={handleFormSubmit}>
              <div className="space-y-3">
                {isCreating && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700">Employee</label>
                    <select name="user_id" required className="w-full p-2 border rounded bg-white">
                      {team?.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-bold text-slate-700">Project</label>
                  <select 
                    name="project_id" 
                    required 
                    defaultValue={editingLog?.project_id || ''} 
                    className="w-full p-2 border rounded bg-white"
                  >
                    <option value="">-- Select Project --</option>
                    {projects?.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-bold text-slate-700">Clock In</label>
                    <input 
                      type="datetime-local" 
                      name="clock_in" 
                      // Format current value safely
                      defaultValue={editingLog ? format(parseISO(editingLog.clock_in_time), "yyyy-MM-dd'T'HH:mm") : ''} 
                      className="w-full p-2 border rounded" 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700">Clock Out</label>
                    <input 
                      type="datetime-local" 
                      name="clock_out" 
                      defaultValue={editingLog?.clock_out_time ? format(parseISO(editingLog.clock_out_time), "yyyy-MM-dd'T'HH:mm") : ''} 
                      className="w-full p-2 border rounded" 
                    />
                  </div>
                </div>
                
                {isCreating && (
                  <div className="flex gap-2 items-center text-xs text-amber-600 bg-amber-50 p-2 rounded">
                    <AlertTriangle size={14} />
                    <p>Times entered are in your local timezone.</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-slate-700">Notes</label>
                  <textarea name="notes" defaultValue={editingLog?.admin_notes} className="w-full p-2 border rounded" />
                </div>
              </div>
              <div className="flex gap-3 pt-6">
                <button type="submit" className="flex-1 py-2 bg-amber-500 text-slate-900 font-bold rounded hover:bg-amber-600">
                  {isCreating ? 'Create Log' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}