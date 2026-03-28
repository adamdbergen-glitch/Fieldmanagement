import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { MapPin, Clock, Loader2, AlertTriangle, Play, Square, Briefcase } from 'lucide-react'

export default function TimeClock({ projectId = null }) {
  // Grab userProfile and isAdmin to check permissions
  const { user, userProfile, isAdmin, loading } = useAuth()
  
  const [status, setStatus] = useState('loading')
  const [currentLog, setCurrentLog] = useState(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [elapsed, setElapsed] = useState('00:00:00')
  
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(projectId || '')

  useEffect(() => {
    if (!loading && user) {
      checkStatus()
      fetchProjects() 
    }
  }, [user, loading])

  useEffect(() => {
    let interval
    if (status === 'clocked-in' && currentLog?.clock_in_time) {
      interval = setInterval(() => {
        const start = new Date(currentLog.clock_in_time)
        const now = new Date()
        const diff = now - start
        
        if (diff >= 0) {
          const h = Math.floor(diff / 3600000).toString().padStart(2, '0')
          const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0')
          const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0')
          setElapsed(`${h}:${m}:${s}`)
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [status, currentLog])

  async function fetchProjects() {
    try {
      let query;
      
      // If Admin, show all active projects. 
      // If Crew/Foreman, ONLY show projects they are assigned to via project_crew table.
      if (isAdmin) {
        query = supabase
          .from('projects')
          .select('id, name')
          .neq('status', 'Completed')
          .order('name')
      } else {
        query = supabase
          .from('projects')
          .select('id, name, project_crew!inner(employee_id)')
          .eq('project_crew.employee_id', user.id)
          .neq('status', 'Completed')
          .order('name')
      }

      const { data, error } = await query
      if (error) throw error
      setProjects(data || [])
    } catch (err) {
      console.error("Error fetching projects:", err)
    }
  }

  const checkStatus = async () => {
    try {
      if (!user) return

      const { data, error } = await supabase
        .from('time_logs')
        .select('*, project:projects(name)') 
        .eq('user_id', user.id)
        .is('clock_out_time', null)
        .order('clock_in_time', { ascending: false })
        .limit(1)

      if (error) throw error

      if (data && data.length > 0) {
        setStatus('clocked-in')
        setCurrentLog(data[0])
      } else {
        setStatus('clocked-out')
        setCurrentLog(null)
      }
    } catch (err) {
      console.error("Error checking status:", err)
      setStatus('clocked-out') 
    }
  }

  const getGPS = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("GPS not supported"))
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position.coords),
        (err) => reject(new Error("Location access required. Please enable GPS.")),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    })
  }

  const handleClockIn = async () => {
    setError(null)

    if (!selectedProject) {
      setError("Please select the project you are working on.")
      return
    }

    setGpsLoading(true)
    try {
      const coords = await getGPS()
      
      const { data, error } = await supabase
        .from('time_logs')
        .insert({
          user_id: user.id,
          project_id: selectedProject, 
          gps_in_lat: coords.latitude,
          gps_in_long: coords.longitude
        })
        .select('*, project:projects(name)')
        .single()

      if (error) throw error
      
      setCurrentLog(data)
      setStatus('clocked-in')
    } catch (err) {
      setError(err.message)
    } finally {
      setGpsLoading(false)
    }
  }

  const handleClockOut = async () => {
    setError(null)
    setGpsLoading(true)
    try {
      if (!currentLog) return
      const coords = await getGPS()

      const { error } = await supabase
        .from('time_logs')
        .update({
          clock_out_time: new Date().toISOString(),
          gps_out_lat: coords.latitude,
          gps_out_long: coords.longitude
        })
        .eq('id', currentLog.id)

      if (error) throw error

      setStatus('clocked-out')
      setCurrentLog(null)
      setElapsed('00:00:00')
      setSelectedProject('') 
    } catch (err) {
      setError(err.message)
    } finally {
      setGpsLoading(false)
    }
  }

  if (loading || status === 'loading') return <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-100 animate-pulse h-32"></div>

  return (
    <div className={`p-6 rounded-xl border shadow-sm transition-all ${
      status === 'clocked-in' ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'
    }`}>
      
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Clock size={20} className={status === 'clocked-in' ? 'text-green-600' : 'text-slate-400'} />
            Time Clock
          </h3>
          {status === 'clocked-in' ? (
            <div>
              <p className="text-green-700 font-mono font-bold text-2xl mt-1">{elapsed}</p>
              <p className="text-xs text-green-600 font-bold flex items-center gap-1 mt-1">
                <Briefcase size={12}/> {currentLog?.project?.name || 'Unknown Job'}
              </p>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Ready to start work?</p>
          )}
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
          status === 'clocked-in' ? 'bg-green-200 text-green-800' : 'bg-slate-100 text-slate-500'
        }`}>
          {status === 'clocked-in' ? 'On Clock' : 'Off Clock'}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {status === 'clocked-out' ? (
        <div className="space-y-3">
          
          {!projectId && (
            <select 
              className="w-full p-3 border border-slate-300 rounded-lg bg-white font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none text-sm transition-shadow"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="">-- Select Project --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          <button 
            onClick={handleClockIn}
            disabled={gpsLoading}
            className="w-full py-4 bg-gradient-to-b from-slate-800 to-slate-950 hover:from-slate-700 hover:to-slate-900 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-[0_10px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_15px_30px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-300"
          >
            {gpsLoading ? <Loader2 className="animate-spin" /> : <Play size={20} fill="currentColor" />}
            CLOCK IN
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-green-700 justify-center font-bold">
            <MapPin size={12} /> Location Tracking Active
          </div>
          <button 
            onClick={handleClockOut}
            disabled={gpsLoading}
            className="w-full py-4 bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-[0_10px_20px_rgba(239,68,68,0.3)] hover:shadow-[0_15px_30px_rgba(239,68,68,0.4)] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-300"
          >
            {gpsLoading ? <Loader2 className="animate-spin" /> : <Square size={20} fill="currentColor" />}
            CLOCK OUT
          </button>
        </div>
      )}
    </div>
  )
}
