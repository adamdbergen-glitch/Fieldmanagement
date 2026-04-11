import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { 
  format, parseISO, differenceInMinutes, addDays, startOfMonth, endOfMonth, 
  setDate, isFuture, isBefore, setHours, setMinutes, isValid 
} from 'date-fns' 
import { 
  Clock, Save, Loader2, Calendar, User, Edit2, X, Settings, MapPin, Plus, 
  Briefcase, AlertTriangle, FileText, Download, Coffee, ArrowRightCircle, Trash2 
} from 'lucide-react'

export default function Timesheets() {
  const queryClient = useQueryClient()
  const { user, userProfile, loading: authLoading } = useAuth()
  
  const [editingLog, setEditingLog] = useState(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [reportPeriod, setReportPeriod] = useState(null)

  // --- 1. FETCH PAYROLL SETTINGS ---
  const { data: payrollConfig } = useQuery({
    queryKey: ['payroll_config'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('setting_value').eq('setting_key', 'payroll_config').single()
      return data?.setting_value || { 
        frequency: 'biweekly', 
        anchor_date: '2025-01-10', 
        pay_delay: 7, 
        auto_clockout: false,
        auto_lunch: false,
        lunch_start: '12:00',
        lunch_duration: 30,
        auto_start_adjust: false,
        official_start_time: '07:00'
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
      let query = supabase.from('time_logs').select(`*, profiles:user_id ( full_name, email, wage ), project:projects ( name )`).order('clock_in_time', { ascending: false })
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

  const deleteLogMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('time_logs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries(['time_logs']) }
  })

  const saveSettingsMutation = useMutation({
    mutationFn: async (newConfig) => {
      const { error } = await supabase.from('app_settings').upsert({ setting_key: 'payroll_config', setting_value: newConfig }, { onConflict: 'setting_key' })
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries(['payroll_config']); setShowSettings(false) }
  })

  // --- HELPER: SAFE DATE FORMATTER ---
  const safeFormat = (dateStr, formatStr) => {
    if (!dateStr) return null
    const date = parseISO(dateStr)
    return isValid(date) ? format(date, formatStr) : 'Invalid Date'
  }

  // --- HELPER: SMART HOURS CALCULATOR (Auto-Lunch) ---
  const calculatePaidMinutes = (clockIn, clockOut) => {
    if (!clockIn || !clockOut) return 0
    const start = parseISO(clockIn)
    const end = parseISO(clockOut)
    
    if (!isValid(start) || !isValid(end)) return 0

    let totalMins = differenceInMinutes(end, start)

    if (payrollConfig?.auto_lunch) {
      const [lunchHour, lunchMin] = (payrollConfig.lunch_start || '12:00').split(':').map(Number)
      const lunchStart = setMinutes(setHours(start, lunchHour), lunchMin)
      const lunchEnd = setMinutes(lunchStart, lunchMin + (parseInt(payrollConfig.lunch_duration) || 30))

      if (isBefore(start, lunchStart) && isBefore(lunchEnd, end)) {
        totalMins -= (parseInt(payrollConfig.lunch_duration) || 0)
      }
    }
    return Math.max(0, totalMins)
  }

  // --- HELPER: Start Time Adjuster ---
  const getAdjustedStartTime = (isoString) => {
    if (!payrollConfig?.auto_start_adjust || !payrollConfig?.official_start_time) return isoString
    const inputTime = parseISO(isoString)
    
    if (!isValid(inputTime)) return isoString

    const [targetHour, targetMin] = payrollConfig.official_start_time.split(':').map(Number)
    const officialStart = setMinutes(setHours(inputTime, targetHour), targetMin)
    if (isBefore(inputTime, officialStart)) {
      return officialStart.toISOString()
    }
    return isoString
  }

  // --- HELPER: Pay Period Logic ---
  const getPeriodData = (dateString) => {
    if (!payrollConfig) return { label: 'Loading...', start: null, end: null }
    if (!dateString) return { label: 'Unscheduled', start: new Date(), end: new Date() } 

    const date = parseISO(dateString)
    if (!isValid(date)) return { label: 'Invalid Date', start: new Date(), end: new Date() } 

    let start, end

    if (payrollConfig.frequency === 'monthly') {
      start = startOfMonth(date); end = endOfMonth(date);
    } else if (payrollConfig.frequency === 'semimonthly') {
      const day = date.getDate()
      if (day <= 15) { start = startOfMonth(date); end = setDate(date, 15); }
      else { start = setDate(date, 16); end = endOfMonth(date); }
    } else {
      const anchor = parseISO(payrollConfig.anchor_date)
      if (!isValid(anchor)) return { label: 'Config Error', start: new Date(), end: new Date() }

      const freqDays = payrollConfig.frequency === 'weekly' ? 7 : 14 
      const diffTime = date.getTime() - anchor.getTime()
      const diffDays = Math.floor(diffTime / (1000 * 3600 * 24))
      const periodIndex = Math.floor(diffDays / freqDays)
      start = addDays(anchor, periodIndex * freqDays)
      end = addDays(start, freqDays - 1)
    }
    
    const payDate = addDays(end, parseInt(payrollConfig.pay_delay || 7))

    return {
      label: `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`,
      key: `${format(start, 'yyyy-MM-dd')}`,
      start, end, payDate
    }
  }

  const groupedLogs = useMemo(() => {
    return logs?.reduce((groups, log) => {
      const { label, key, payDate } = getPeriodData(log.clock_in_time)
      if (!groups[key]) groups[key] = { label, payDate, logs: [] }
      groups[key].logs.push(log)
      return groups
    }, {})
  }, [logs, payrollConfig])

  const generateReport = (periodKey) => {
    const periodData = groupedLogs[periodKey]
    if (!periodData) return []
    const summary = periodData.logs.reduce((acc, log) => {
      if (!log.clock_out_time) return acc
      const name = log.profiles?.full_name || 'Unknown'
      const mins = calculatePaidMinutes(log.clock_in_time, log.clock_out_time)
      if (!acc[name]) acc[name] = { name, totalMins: 0, wage: log.profiles?.wage || 0 }
      acc[name].totalMins += mins
      return acc
    }, {})
    return Object.values(summary).sort((a, b) => a.name.localeCompare(b.name))
  }

  const handleDeleteLog = (id) => {
    if (window.confirm("Are you sure you want to permanently delete this log?")) {
      deleteLogMutation.mutate(id)
    }
  }

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const rawStart = new Date(formData.get('clock_in')).toISOString()
    const endVal = formData.get('clock_out')
    const end = endVal ? new Date(endVal).toISOString() : null
    
    const start = getAdjustedStartTime(rawStart)

    if (isFuture(parseISO(start))) return alert("Error: Clock In time cannot be in the future.")
    if (end && isFuture(parseISO(end))) return alert("Error: Clock Out time cannot be in the future.")
    if (end && isBefore(parseISO(end), parseISO(start))) return alert("Error: Negative time detected.")

    const payload = {
      clock_in_time: start,
      clock_out_time: end,
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
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1 md:ml-6">
                  Pay Day: {group.payDate && isValid(group.payDate) ? format(group.payDate, 'MMM d, yyyy') : 'Pending Config'}
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase text-slate-400 bg-slate-200 px-2 py-1 rounded">{group.logs.length} Shifts</span>
                {userProfile?.role === 'admin' && (
                  <button 
                    onClick={() => setReportPeriod(key)}
                    className="text-xs font-bold flex items-center gap-1 bg-white border border-slate-300 text-slate-600 px-3 py-1 rounded hover:text-blue-600 hover:border-blue-300 transition-colors shadow-sm"
                  >
                    <FileText size={14}/> Report
                  </button>
                )}
              </div>
            </div>
            
            {/* NEW: MOBILE-OPTIMIZED CARD LAYOUT (Replaces traditional table) */}
            <div className="w-full">
              {/* Desktop Header */}
              <div className="hidden md:grid grid-cols-12 gap-4 p-4 bg-white border-b border-slate-100">
                <div className="col-span-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Person / Project</div>
                <div className="col-span-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</div>
                <div className="col-span-3 text-xs font-bold text-slate-400 uppercase tracking-wider">In / Out</div>
                <div className="col-span-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Total (Paid)</div>
                {userProfile?.role === 'admin' && <div className="col-span-1 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</div>}
              </div>
              
              {/* List Body */}
              <div className="divide-y divide-slate-100 bg-slate-50/50 md:bg-white p-4 md:p-0 space-y-4 md:space-y-0">
                {group.logs.map(log => {
                   const paidMinutes = calculatePaidMinutes(log.clock_in_time, log.clock_out_time)
                   const hours = Math.floor(paidMinutes / 60)
                   const mins = paidMinutes % 60
                   
                   return (
                    <div key={log.id} className="bg-white md:bg-transparent rounded-2xl md:rounded-none border border-slate-200 md:border-none shadow-sm md:shadow-none p-4 md:p-0 hover:bg-slate-50/50 transition-colors">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-4 md:p-4 items-center">
                        
                        {/* Mobile Header: Date & Actions */}
                        <div className="md:hidden flex justify-between items-center pb-3 border-b border-slate-100">
                          <span className="text-slate-600 text-sm font-mono font-bold flex items-center gap-2">
                            <Calendar size={14} className="text-amber-500"/>
                            {safeFormat(log.clock_in_time, 'EEE, MMM d')}
                          </span>
                          {userProfile?.role === 'admin' && (
                            <div className="flex items-center gap-3">
                              <button onClick={() => setEditingLog(log)} className="text-slate-400 hover:text-blue-600 transition-colors bg-slate-50 p-1.5 rounded-lg border border-slate-200" title="Edit">
                                <Edit2 size={16} />
                              </button>
                              <button onClick={() => handleDeleteLog(log.id)} className="text-slate-400 hover:text-red-500 transition-colors bg-red-50 p-1.5 rounded-lg border border-red-100" title="Delete">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Person / Project */}
                        <div className="col-span-1 md:col-span-4 flex items-center gap-3">
                          <div className="w-10 h-10 md:w-8 md:h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm md:text-xs shrink-0">
                            {log.profiles?.full_name?.charAt(0) || <User size={12}/>}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 text-base md:text-sm block">{log.profiles?.full_name}</span>
                            <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Briefcase size={12} className="md:w-3 md:h-3"/> {log.project?.name || 'No Project'}</span>
                          </div>
                        </div>

                        {/* Desktop Date */}
                        <div className="hidden md:block col-span-2 text-slate-600 text-sm font-mono font-medium">
                          {safeFormat(log.clock_in_time, 'EEE, MMM d')}
                        </div>
                        
                        {/* In / Out */}
                        <div className="col-span-1 md:col-span-3 bg-slate-50 md:bg-transparent p-3 md:p-0 rounded-xl md:rounded-none flex items-center justify-between md:justify-start border border-slate-100 md:border-none">
                          <div className="text-sm">
                            <span className="text-[10px] font-bold text-slate-400 uppercase md:hidden block mb-1">Clock In / Out</span>
                            <span className="text-green-700 font-bold">{safeFormat(log.clock_in_time, 'h:mm a')}</span>
                            {log.gps_in_lat && (
                              <a href={`https://www.google.com/maps?q=${log.gps_in_lat},${log.gps_in_long}`} target="_blank" rel="noreferrer" className="inline-block ml-1 text-slate-300 hover:text-blue-500">
                                <MapPin size={12} />
                              </a>
                            )}
                            <span className="text-slate-300 mx-2">-</span>
                            {log.clock_out_time ? (
                              <>
                                <span className="text-slate-700 font-medium">{safeFormat(log.clock_out_time, 'h:mm a')}</span>
                                {log.gps_out_lat && (
                                  <a href={`https://www.google.com/maps?q=${log.gps_out_lat},${log.gps_out_long}`} target="_blank" rel="noreferrer" className="inline-block ml-1 text-slate-300 hover:text-blue-500">
                                    <MapPin size={12} />
                                  </a>
                                )}
                              </>
                            ) : (
                              <span className="text-amber-600 font-bold text-[10px] uppercase bg-amber-50 px-2 py-0.5 rounded ml-1 border border-amber-200">Active</span>
                            )}
                          </div>
                        </div>

                        {/* Total Paid */}
                        <div className="col-span-1 md:col-span-2 flex items-center justify-between md:justify-start pt-2 md:pt-0 border-t border-slate-100 md:border-none mt-1 md:mt-0">
                          <span className="text-[10px] font-bold text-slate-400 uppercase md:hidden block">Total Paid Hours</span>
                          <span className="font-bold text-slate-800 text-base md:text-sm">
                            {log.clock_out_time ? (
                              <div className="flex items-center gap-2">
                                <span>{`${hours}h ${mins}m`}</span>
                                {differenceInMinutes(parseISO(log.clock_out_time), parseISO(log.clock_in_time)) > paidMinutes && (
                                  <Coffee size={14} className="text-amber-500" title="Lunch Auto-Deducted"/>
                                )}
                              </div>
                            ) : '-'}
                          </span>
                        </div>
                        
                        {/* Desktop Actions */}
                        {userProfile?.role === 'admin' && (
                          <div className="hidden md:flex col-span-1 justify-end gap-3">
                            <button onClick={() => setEditingLog(log)} className="text-slate-300 hover:text-blue-600 transition-colors" title="Edit">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => handleDeleteLog(log.id)} className="text-slate-300 hover:text-red-500 transition-colors" title="Delete">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                   )
                })}
              </div>
            </div>
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
                    <th className="p-3 text-xs font-bold text-slate-500 uppercase text-right">Total Hours (Net)</th>
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
              <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded font-bold hover:bg-slate-800"><Download size={18}/> Print / PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* --- SETTINGS MODAL --- */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Payroll Config</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              saveSettingsMutation.mutate({ 
                frequency: formData.get('frequency'), 
                anchor_date: formData.get('anchor_date'),
                pay_delay: formData.get('pay_delay'),
                auto_clockout: formData.get('auto_clockout') === 'on',
                auto_lunch: formData.get('auto_lunch') === 'on',
                lunch_start: formData.get('lunch_start'),
                lunch_duration: formData.get('lunch_duration'),
                auto_start_adjust: formData.get('auto_start_adjust') === 'on',
                official_start_time: formData.get('official_start_time')
              })
            }}>
              <div className="space-y-6">
                
                {/* 1. General Settings */}
                <div className="space-y-3 pb-4 border-b border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pay Cycles</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-bold text-slate-700">Frequency</label>
                      <select name="frequency" defaultValue={payrollConfig?.frequency} className="w-full p-2 border rounded">
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Bi-Weekly</option>
                        <option value="semimonthly">Semi-Monthly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700">Start Date</label>
                      <input type="date" name="anchor_date" defaultValue={payrollConfig?.anchor_date} className="w-full p-2 border rounded" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700">Pay Delay (Days)</label>
                    <input type="number" name="pay_delay" defaultValue={payrollConfig?.pay_delay || 7} className="w-full p-2 border rounded" />
                  </div>
                </div>

                {/* 2. Automation Rules */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Automation Rules</h4>
                  
                  {/* Auto-Lunch */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <input type="checkbox" name="auto_lunch" defaultChecked={payrollConfig?.auto_lunch} className="w-4 h-4 accent-amber-500" />
                      <label className="font-bold text-slate-700 text-sm flex items-center gap-2"><Coffee size={14} /> Auto-Deduct Lunch</label>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pl-6">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Start Time</label>
                        <input type="time" name="lunch_start" defaultValue={payrollConfig?.lunch_start || '12:00'} className="w-full p-1 border rounded text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400">Duration (Mins)</label>
                        <input type="number" name="lunch_duration" defaultValue={payrollConfig?.lunch_duration || 30} className="w-full p-1 border rounded text-sm" />
                      </div>
                    </div>
                  </div>

                  {/* Auto-Start Adjust */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <input type="checkbox" name="auto_start_adjust" defaultChecked={payrollConfig?.auto_start_adjust} className="w-4 h-4 accent-amber-500" />
                      <label className="font-bold text-slate-700 text-sm flex items-center gap-2"><ArrowRightCircle size={14} /> Round Early Clock-In</label>
                    </div>
                    <div className="pl-6">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Official Start Time</label>
                      <input type="time" name="official_start_time" defaultValue={payrollConfig?.official_start_time || '07:00'} className="w-full p-1 border rounded text-sm" />
                      <p className="text-[10px] text-slate-400 mt-1">If clocked in early, time snaps to this.</p>
                    </div>
                  </div>

                  {/* Auto-Clockout */}
                  <div className="flex items-center gap-2">
                    <input type="checkbox" name="auto_clockout" defaultChecked={payrollConfig?.auto_clockout} className="w-4 h-4 accent-amber-500" />
                    <label className="text-sm font-bold text-slate-700">Auto-Close Shift @ 23:59</label>
                  </div>
                </div>

              </div>
              <div className="flex gap-3 pt-6 border-t border-slate-100 mt-4">
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
                    <input type="datetime-local" name="clock_in" defaultValue={editingLog && isValid(parseISO(editingLog.clock_in_time)) ? format(parseISO(editingLog.clock_in_time), "yyyy-MM-dd'T'HH:mm") : ''} className="w-full p-2 border rounded" required />
                  </div>
                  <div>
                    <label className="block text-sm font-bold">Out</label>
                    <input type="datetime-local" name="clock_out" defaultValue={editingLog?.clock_out_time && isValid(parseISO(editingLog.clock_out_time)) ? format(parseISO(editingLog.clock_out_time), "yyyy-MM-dd'T'HH:mm") : ''} className="w-full p-2 border rounded" />
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
