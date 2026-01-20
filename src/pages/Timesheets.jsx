import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, parseISO, differenceInMinutes, addDays, startOfMonth, endOfMonth, setDate, isFuture, isBefore } from 'date-fns'
import { Clock, Save, Loader2, Calendar, User, Edit2, X, Settings, MapPin, Plus, Briefcase, AlertTriangle, FileText, Download } from 'lucide-react'

export default function Timesheets() {
  const queryClient = useQueryClient()
  const { user, userProfile, loading: authLoading } = useAuth()
  
  const [editingLog, setEditingLog] = useState(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  
  // NEW: State for Payroll Report Modal
  const [reportPeriod, setReportPeriod] = useState(null)

  // --- 1. FETCH PAYROLL SETTINGS ---
  const { data: payrollConfig } = useQuery({
    queryKey: ['payroll_config'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('setting_value').eq('setting_key', 'payroll_config').single()
      return data?.setting_value || { 
        frequency: 'biweekly', 
        anchor_date: '2025-01-10', // Default start
        pay_delay: 7, // NEW: Days between period end and pay day
        auto_clockout: false 
      }
    }
  })

  // --- FETCH LISTS ---
  const { data: team } = useQuery({ queryKey: ['team_list'], queryFn: async () => (await supabase.from('profiles').select('id, full_name, wage').order('full_name')).data })
  const { data: projects } = useQuery({ queryKey: ['project_list'], queryFn: async () => (await supabase.from('projects').select('id, name').neq('status', 'Completed').order('name')).data })

  // --- 2. FETCH LOGS ---
  const { data: logs, isLoading: isQueryLoading } = useQuery({
    queryKey: ['time_logs', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      let query = supabase
        .from('time_logs')
        .select(`*, profiles:user_id ( full_name, email, wage ), project:projects ( name )`)
        .order('clock_in_time', { ascending: false })

      if (userProfile?.role !== 'admin') query = query.eq('user_id', user.id)
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
      const { error } = await supabase.from('time_logs').update({
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
      const { error } = await supabase.from('app_settings').upsert({ setting_key: 'payroll_config', setting_value: newConfig }, { onConflict: 'setting_key' })
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries(['payroll_config']); setShowSettings(false) }
  })

  // --- HELPER: Pay Period Logic ---
  const getPeriodData = (dateString) => {
    if (!payrollConfig) return { label: 'Loading...', start: null, end: null }
    const date = parseISO(dateString)
    let start, end

    if (payrollConfig.frequency === 'monthly') {
      start = startOfMonth(date); end = endOfMonth(date);
    } else if (payrollConfig.frequency === 'semimonthly') {
      const day = date.getDate()
      if (day <= 15) { start = startOfMonth(date); end = setDate(date, 15); }
      else { start = setDate(date, 16); end = endOfMonth(date); }
    } else {
      const anchor = parseISO(payrollConfig.anchor_date)
      const freqDays = payrollConfig.frequency === 'weekly' ? 7 : 14 
      const diffTime = date.getTime() - anchor.getTime()
      const diffDays = Math.floor(diffTime / (1000 * 3600 * 24))
      const periodIndex = Math.floor(diffDays / freqDays)
      start = addDays(anchor, periodIndex * freqDays)
      end = addDays(start, freqDays - 1)
    }
    
    // NEW: Calculate Pay Date using Pay Delay setting
    const payDate = addDays(end, parseInt(payrollConfig.pay_delay || 7))

    return {
      label: `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`,
      key: `${format(start, 'yyyy-MM-dd')}`,
      start, end, payDate
    }
  }

  // Group Logs
  const groupedLogs = useMemo(() => {
    return logs?.reduce((groups, log) => {
      const { label, key, payDate } = getPeriodData(log.clock_in_time)
      if (!groups[key]) groups[key] = { label, payDate, logs: [] }
      groups[key].logs.push(log)
      return groups
    }, {})
  }, [logs, payrollConfig])

  // --- REPORT GENERATOR ---
  const generateReport = (periodKey) => {
    const periodData = groupedLogs[periodKey]
    if (!periodData) return []
    
    const summary = periodData.logs.reduce((acc, log) => {
      if (!log.clock_out_time) return acc
      const name = log.profiles?.full_name || 'Unknown'
      const mins = differenceInMinutes(parseISO(log.clock_out_time), parseISO(log.clock_in_time))
      
      if (!acc[name]) acc[name] = { name, totalMins: 0, wage: log.profiles?.wage || 0 }
      acc[name].totalMins += mins
      return acc
    }, {})

    return Object.values(summary).sort((a, b) => a.name.localeCompare(b.name))
  }

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const start = new Date(formData.get('clock_in'))
    const end = formData.get('clock_out') ? new Date(formData.get('clock_out')) : null
    
    if (isFuture(start)) return alert("Error: Clock In time cannot be in the future.")
    if (end && isBefore(end, start)) return alert("Error: Negative time detected.")

    const payload = {
      clock_in_time: start.toISOString(),
      clock_out_time: end ? end.toISOString() : null,
      admin_notes: formData.get('notes'),
      project_id: formData.get('project_id')
    }

    if (isCreating) createLogMutation.mutate({ ...payload, user_id: formData.get('user_id') })
    else updateLogMutation.mutate({ ...payload, id: editingLog.id })
  }

  if (authLoading || isQueryLoading) return <div className="p-12 text-center"><Loader2 className="animate-spin inline text-amber-500 mr-2"/> Loading...</div>

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Timesheets</h1>
          <p className="text-slate-500">Manage hours, periods, and payroll exports.</p>
        </div>
        {userProfile?.role === 'admin' && (
          <div className="flex gap-2">
            <button onClick={() => setIsCreating(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg font-bold shadow-sm hover:bg-slate-800 transition-colors"><Plus size={18} /> Add Entry</button>
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-blue-600 font-bold transition-colors shadow-sm"><Settings size={18} /> Settings</button>
          </div>
        )}
      </div>

      {/* LOGS LIST */}
      <div className="space-y-8">
        {groupedLogs && Object.entries(groupedLogs).map(([key, group]) => (
          <div key={key} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-2">
              <div>
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  <Calendar size={18} className="text-amber-500"/> {group.label}
                </h3>
                {/* NEW: Pay Day Display */}
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1 ml-6">
                  Pay Day: {format(group.payDate, 'MMM d, yyyy')}
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase text-slate-400 bg-slate-200 px-2 py-1 rounded">{group.logs.length} Shifts</span>
                {/* NEW: Report Button */}
                {userProfile?.role === 'admin' && (
                  <button 
                    onClick={() => setReportPeriod(key)}
                    className="text-xs font-bold flex items-center gap-1 bg-white border border-slate-300 text-slate-600 px-3 py-1 rounded hover:text-blue-600 hover:border-blue-300 transition-colors"
                  >
                    <FileText size={14}/> Report
                  </button>
                )}
              </div>
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
                {group.logs.map(log => {
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
                            <span className="text-xs text-slate-500 flex items-center gap-1"><Briefcase size={10}/> {log.project?.name || 'No Project'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600 text-sm font-mono hidden md:table-cell">{format(parseISO(log.clock_in_time), 'EEE, MMM d')}</td>
                      <td className="p-4 text-sm">
                        <span className="text-green-700 font-bold">{format(parseISO(log.clock_in_time), 'h:mm a')}</span>
                        <span className="text-slate-300 mx-2">-</span>
                        {log.clock_out_time ? <span className="text-slate-700">{format(parseISO(log.clock_out_time), 'h:mm a')}</span> : <span className="text-amber-600 font-bold text-xs uppercase bg-amber-50 px-2 py-0.5 rounded">Active</span>}
                      </td>
                      <td className="p-4 font-bold text-slate-800 text-sm">{log.clock_out_time ? `${hours}h ${mins}m` : '-'}</td>
                      {userProfile?.role === 'admin' && <td className="p-4 text-right"><button onClick={() => setEditingLog(log)} className="text-slate-300 hover:text-blue-600"><Edit2 size={16} /></button></td>}
                    </tr>
                   )
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* --- MODAL: PAYROLL REPORT --- */}
      {reportPeriod && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Payroll Summary</h3>
                <p className="text-slate-500 text-sm">{groupedLogs[reportPeriod]?.label}</p>
              </div>
              <button onClick={() => setReportPeriod(null)}><X className="text-slate-400 hover:text-slate-700"/></button>
            </div>
            
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase">Employee</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase text-right">Total Hours</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase text-right">Wage</th>
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase text-right">Est. Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {generateReport(reportPeriod).map(row => {
                    const hours = (row.totalMins / 60).toFixed(2)
                    const pay = (hours * row.wage).toFixed(2)
                    return (
                      <tr key={row.name}>
                        <td className="p-3 font-bold text-slate-800">{row.name}</td>
                        <td className="p-3 text-right font-mono text-slate-600">{hours}</td>
                        <td className="p-3 text-right font-mono text-slate-400">${row.wage}/hr</td>
                        <td className="p-3 text-right font-mono font-bold text-green-700">${pay}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded font-bold hover:bg-slate-800">
                <Download size={18}/> Print / PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SETTINGS MODAL --- */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Payroll Config</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              saveSettingsMutation.mutate({ 
                frequency: formData.get('frequency'), 
                anchor_date: formData.get('anchor_date'),
                pay_delay: formData.get('pay_delay'), // NEW
                auto_clockout: formData.get('auto_clockout') === 'on'
              })
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Frequency</label>
                  <select name="frequency" defaultValue={payrollConfig?.frequency} className="w-full p-2 border rounded">
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-Weekly</option>
                    <option value="semimonthly">Semi-Monthly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Cycle Start</label>
                    <input type="date" name="anchor_date" defaultValue={payrollConfig?.anchor_date} className="w-full p-2 border rounded" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Pay Delay (Days)</label>
                    <input type="number" name="pay_delay" defaultValue={payrollConfig?.pay_delay || 7} className="w-full p-2 border rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <input type="checkbox" name="auto_clockout" defaultChecked={payrollConfig?.auto_clockout} className="w-5 h-5 accent-amber-500" />
                  <label className="text-sm font-bold text-slate-700">Auto-Close @ 23:59</label>
                </div>
              </div>
              <div className="flex gap-3 pt-6">
                <button type="button" onClick={() => setShowSettings(false)} className="flex-1 py-2 font-bold text-slate-500 bg-slate-100 rounded">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-slate-900 text-white font-bold rounded">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT / CREATE LOG MODAL --- */}
      {(editingLog || isCreating) && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">{isCreating ? 'Add Entry' : 'Edit Log'}</h3>
              <button onClick={() => { setEditingLog(null); setIsCreating(false); }}><X className="text-slate-400 hover:text-slate-700"/></button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="space-y-3">
                {isCreating && (
                  <div><label className="block text-sm font-bold">Employee</label><select name="user_id" required className="w-full p-2 border rounded">{team?.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
                )}
                <div><label className="block text-sm font-bold">Project</label><select name="project_id" required defaultValue={editingLog?.project_id || ''} className="w-full p-2 border rounded"><option value="">-- Select --</option>{projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-bold">In</label>
                    <input type="datetime-local" name="clock_in" defaultValue={editingLog ? format(parseISO(editingLog.clock_in_time), "yyyy-MM-dd'T'HH:mm") : ''} className="w-full p-2 border rounded" required />
                  </div>
                  <div>
                    <label className="block text-sm font-bold">Out</label>
                    <input type="datetime-local" name="clock_out" defaultValue={editingLog?.clock_out_time ? format(parseISO(editingLog.clock_out_time), "yyyy-MM-dd'T'HH:mm") : ''} className="w-full p-2 border rounded" />
                  </div>
                </div>
                
                {isCreating && (
                  <div className="flex gap-2 items-center text-xs text-amber-600 bg-amber-50 p-2 rounded">
                    <AlertTriangle size={14} />
                    <p>Times entered are in your local timezone.</p>
                  </div>
                )}

                <div><label className="block text-sm font-bold">Notes</label><textarea name="notes" defaultValue={editingLog?.admin_notes} className="w-full p-2 border rounded" /></div>
              </div>
              <div className="flex gap-3 pt-6"><button className="w-full py-2 bg-amber-500 font-bold rounded">Save</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}