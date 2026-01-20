import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import { Clock, Save, Loader2, Calendar, User, Edit2, X, AlertCircle } from 'lucide-react'

export default function Timesheets() {
  const queryClient = useQueryClient()
  const [editingLog, setEditingLog] = useState(null) // The log currently being edited

  // Fetch all logs
  const { data: logs, isLoading } = useQuery({
    queryKey: ['time_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_logs')
        .select(`
          *,
          profiles:user_id ( full_name, email )
        `)
        .order('clock_in_time', { ascending: false })
      
      if (error) throw error
      return data
    }
  })

  // Update Mutation
  const updateLogMutation = useMutation({
    mutationFn: async (updatedData) => {
      const { error } = await supabase
        .from('time_logs')
        .update({
          clock_in_time: updatedData.clock_in_time,
          clock_out_time: updatedData.clock_out_time,
          admin_notes: updatedData.admin_notes
        })
        .eq('id', updatedData.id)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['time_logs'])
      setEditingLog(null)
    },
    onError: (err) => alert(err.message)
  })

  // Helper to calculate duration
  const getDuration = (start, end) => {
    if (!end) return 'Active'
    const minutes = differenceInMinutes(parseISO(end), parseISO(start))
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}m`
  }

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="animate-spin inline text-amber-500"/> Loading timesheets...</div>

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Timesheets</h1>
          <p className="text-slate-500">Review and adjust employee hours.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase">Employee</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase">Date</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase">In / Out</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase">Duration</th>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs?.map(log => (
              <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                      {log.profiles?.full_name?.charAt(0) || <User size={14}/>}
                    </div>
                    <span className="font-medium text-slate-900">{log.profiles?.full_name || 'Unknown'}</span>
                  </div>
                </td>
                <td className="p-4 text-slate-600">
                  {format(parseISO(log.clock_in_time), 'MMM do, yyyy')}
                </td>
                <td className="p-4">
                  <div className="text-sm">
                    <span className="text-green-700 font-mono">{format(parseISO(log.clock_in_time), 'h:mm a')}</span>
                    <span className="text-slate-300 mx-2">→</span>
                    {log.clock_out_time ? (
                      <span className="text-red-700 font-mono">{format(parseISO(log.clock_out_time), 'h:mm a')}</span>
                    ) : (
                      <span className="text-amber-500 font-bold text-xs uppercase bg-amber-50 px-2 py-0.5 rounded">Active</span>
                    )}
                  </div>
                  {log.gps_in_lat && (
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                      <Clock size={10} /> GPS Verified
                    </div>
                  )}
                </td>
                <td className="p-4 font-bold text-slate-700">
                  {getDuration(log.clock_in_time, log.clock_out_time)}
                </td>
                <td className="p-4 text-right">
                  <button 
                    onClick={() => setEditingLog(log)}
                    className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {logs?.length === 0 && (
          <div className="p-12 text-center text-slate-400">No time logs recorded yet.</div>
        )}
      </div>

      {/* EDIT MODAL */}
      {editingLog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900">Adjust Time Log</h3>
              <button onClick={() => setEditingLog(null)} className="text-slate-400 hover:text-slate-700"><X size={20}/></button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.target)
              updateLogMutation.mutate({
                id: editingLog.id,
                clock_in_time: formData.get('clock_in'),
                clock_out_time: formData.get('clock_out') || null,
                admin_notes: formData.get('notes')
              })
            }} className="space-y-4">
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Clock In Time</label>
                <input 
                  type="datetime-local" 
                  name="clock_in"
                  required
                  defaultValue={format(parseISO(editingLog.clock_in_time), "yyyy-MM-dd'T'HH:mm")}
                  className="w-full p-2 border border-slate-300 rounded focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Clock Out Time</label>
                <input 
                  type="datetime-local" 
                  name="clock_out"
                  defaultValue={editingLog.clock_out_time ? format(parseISO(editingLog.clock_out_time), "yyyy-MM-dd'T'HH:mm") : ''}
                  className="w-full p-2 border border-slate-300 rounded focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Admin Notes</label>
                <textarea 
                  name="notes"
                  placeholder="Reason for adjustment..."
                  defaultValue={editingLog.admin_notes || ''}
                  className="w-full p-2 border border-slate-300 rounded focus:border-amber-500 focus:outline-none text-sm h-20"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setEditingLog(null)} className="flex-1 py-2 text-slate-600 font-bold bg-slate-100 hover:bg-slate-200 rounded-lg">Cancel</button>
                <button 
                  type="submit" 
                  disabled={updateLogMutation.isPending}
                  className="flex-1 py-2 text-white font-bold bg-amber-500 hover:bg-amber-600 rounded-lg flex items-center justify-center gap-2"
                >
                  {updateLogMutation.isPending ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}