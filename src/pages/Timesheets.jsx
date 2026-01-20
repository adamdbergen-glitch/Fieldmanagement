import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, parseISO, differenceInMinutes, addDays, startOfDay } from 'date-fns'
import { Clock, Save, Loader2, Calendar, User, Edit2, X, Settings, Filter } from 'lucide-react'

export default function Timesheets() {
  const queryClient = useQueryClient()
  const { user, userProfile } = useAuth()
  
  const [editingLog, setEditingLog] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  // --- 1. FETCH PAYROLL SETTINGS ---
  const { data: payrollConfig } = useQuery({
    queryKey: ['payroll_config'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('setting_value').eq('setting_key', 'payroll_config').single()
      return data?.setting_value || { frequency: 'biweekly', anchor_date: '2025-01-01' }
    }
  })

  // --- 2. FETCH LOGS (Filtered by Role) ---
  const { data: logs, isLoading } = useQuery({
    queryKey: ['time_logs', user.id],
    queryFn: async () => {
      let query = supabase
        .from('time_logs')
        .select(`*, profiles:user_id ( full_name, email )`)
        .order('clock_in_time', { ascending: false })

      // IF CREW: Filter to ONLY their data
      if (userProfile?.role !== 'admin') {
        query = query.eq('user_id', user.id)
      }
      
      const { data, error } = await query
      if (error) throw error
      return data
    }
  })

  // --- 3. MUTATIONS (Update Log & Update Settings) ---
  const updateLogMutation = useMutation({
    mutationFn: async (updatedData) => {
      const { error } = await supabase.from('time_logs')
        .update({
          clock_in_time: updatedData.clock_in_time,
          clock_out_time: updatedData.clock_out_time,
          admin_notes: updatedData.admin_notes
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

  // --- HELPER: Calculate Pay Period ---
  // Returns a string label for the pay period a log belongs to
  const getPayPeriodLabel = (dateString) => {
    if (!payrollConfig) return 'Loading...'
    const date = parseISO(dateString)
    const anchor = parseISO(payrollConfig.anchor_date)
    const freqDays = payrollConfig.frequency === 'weekly' ? 7 : 14 
    
    // Calculate difference in days to find which "block" of time this falls in
    const diffTime = date.getTime() - anchor.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 3600 * 24))
    
    // Find the start of THIS specific period
    const periodIndex = Math.floor(diffDays / freqDays)
    const periodStart = addDays(anchor, periodIndex * freqDays)
    const periodEnd = addDays(periodStart, freqDays - 1)

    return `${format(periodStart, 'MMM d')} - ${format(periodEnd, 'MMM d, yyyy')}`
  }

  // Group logs by Pay Period
  const groupedLogs = logs?.reduce((groups, log) => {
    const period = getPayPeriodLabel(log.clock_in_time)
    if (!groups[period]) groups[period] = []
    groups[period].push(log)
    return groups
  }, {})

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="animate-spin inline text-amber-500"/> Loading timesheets...</div>

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Timesheets</h1>
          <p className="text-slate-500">
            {userProfile?.role === 'admin' ? 'Review employee hours & payroll.' : 'Your work history.'}
          </p>
        </div>
        
        {/* ADMIN SETTINGS BUTTON */}
        {userProfile?.role === 'admin' && (
          <button 
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-blue-600 font-bold transition-colors shadow-sm"
          >
            <Settings size={18} /> Payroll Settings
          </button>
        )}
      </div>

      {/* RENDER GROUPS */}
      <div className="space-y-8">
        {groupedLogs && Object.keys(groupedLogs).map((period) => (
          <div key={period} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* PERIOD HEADER */}
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
                  <th className="p-4 text-xs font-bold text-slate-400 uppercase">Person</th>
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
                          <span className="font-medium text-slate-900 text-sm">{log.profiles?.full_name}</span>
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
                        <span className="text-slate-300 mx-1">-</span>
                        {log.clock_out_time ? (
                          <span className="text-slate-700">{format(parseISO(log.clock_out_time), 'h:mm a')}</span>
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

      {/* --- SETTINGS MODAL (Admin Only) --- */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Payroll Settings</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              saveSettingsMutation.mutate({
                frequency: formData.get('frequency'),
                anchor_date: formData.get('anchor_date')
              })
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Pay Frequency</label>
                  <select name="frequency" defaultValue={payrollConfig?.frequency} className="w-full p-2 border border-slate-300 rounded">
                    <option value="weekly">Weekly (Every 7 Days)</option>
                    <option value="biweekly">Bi-Weekly (Every 14 Days)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Anchor Date (Start of a Period)</label>
                  <input type="date" name="anchor_date" defaultValue={payrollConfig?.anchor_date} className="w-full p-2 border border-slate-300 rounded" required />
                  <p className="text-xs text-slate-500 mt-1">Pick ANY past date that was a payday or period start. The app calculates future cycles from here.</p>
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

      {/* --- EDIT LOG MODAL --- */}
      {editingLog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Edit Time Log</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              updateLogMutation.mutate({
                id: editingLog.id,
                clock_in_time: formData.get('clock_in'),
                clock_out_time: formData.get('clock_out') || null,
                admin_notes: formData.get('notes')
              })
            }}>
              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-700">Clock In</label>
                <input type="datetime-local" name="clock_in" defaultValue={format(parseISO(editingLog.clock_in_time), "yyyy-MM-dd'T'HH:mm")} className="w-full p-2 border rounded" required />
                
                <label className="block text-sm font-bold text-slate-700">Clock Out</label>
                <input type="datetime-local" name="clock_out" defaultValue={editingLog.clock_out_time ? format(parseISO(editingLog.clock_out_time), "yyyy-MM-dd'T'HH:mm") : ''} className="w-full p-2 border rounded" />
                
                <label className="block text-sm font-bold text-slate-700">Notes</label>
                <textarea name="notes" defaultValue={editingLog.admin_notes} className="w-full p-2 border rounded" />
              </div>
              <div className="flex gap-3 pt-6">
                <button type="button" onClick={() => setEditingLog(null)} className="flex-1 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-amber-500 text-slate-900 font-bold rounded hover:bg-amber-600">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}