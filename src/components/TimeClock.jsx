import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { MapPin, Clock, Loader2, AlertTriangle, Play, Square } from 'lucide-react'

export default function TimeClock({ projectId = null }) {
  const { user, loading } = useAuth() // 1. Get loading state
  const [status, setStatus] = useState('loading')
  const [currentLog, setCurrentLog] = useState(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [elapsed, setElapsed] = useState('00:00:00')

  // EFFECT 1: Check Status ONLY when user loads
  useEffect(() => {
    if (!loading && user) {
      checkStatus()
    }
  }, [user, loading])

  // EFFECT 2: Handle the Timer (Independent of DB fetching)
  useEffect(() => {
    let interval
    if (status === 'clocked-in' && currentLog?.clock_in_time) {
      interval = setInterval(() => {
        const start = new Date(currentLog.clock_in_time)
        const now = new Date()
        const diff = now - start
        
        // Prevent negative time
        if (diff >= 0) {
          const h = Math.floor(diff / 3600000).toString().padStart(2, '0')
          const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0')
          const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0')
          setElapsed(`${h}:${m}:${s}`)
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [status, currentLog]) // Only re-run if status changes

  const checkStatus = async () => {
    try {
      if (!user) return

      const { data, error } = await supabase
        .from('time_logs')
        .select('*')
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
      console.error("Error checking time clock status:", err)
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
        (err) => reject(new Error("GPS Permission Denied. Please enable location services.")),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    })
  }

  const handleClockIn = async () => {
    setError(null)
    setGpsLoading(true)
    try {
      const coords = await getGPS()
      const { data, error } = await supabase
        .from('time_logs')
        .insert({
          user_id: user.id,
          project_id: projectId,
          gps_in_lat: coords.latitude,
          gps_in_long: coords.longitude
        })
        .select()
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Clock size={20} className={status === 'clocked-in' ? 'text-green-600' : 'text-slate-400'} />
            Time Clock
          </h3>
          {status === 'clocked-in' ? (
            <p className="text-green-700 font-mono font-bold text-2xl mt-1">{elapsed}</p>
          ) : (
            <p className="text-slate-500 text-sm">Ready to start work?</p>
          )}
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
          status === 'clocked-in' ? 'bg-green-200 text-green-800' : 'bg-slate-100 text-slate-500'
        }`}>
          {status === 'clocked-in' ? 'On The Clock' : 'Off Clock'}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {status === 'clocked-out' ? (
        <button 
          onClick={handleClockIn}
          disabled={gpsLoading}
          className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
        >
          {gpsLoading ? <Loader2 className="animate-spin" /> : <Play size={20} fill="currentColor" />}
          CLOCK IN
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-green-700 justify-center">
            <MapPin size={12} /> Location Tracking Active
          </div>
          <button 
            onClick={handleClockOut}
            disabled={gpsLoading}
            className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
          >
            {gpsLoading ? <Loader2 className="animate-spin" /> : <Square size={20} fill="currentColor" />}
            CLOCK OUT
          </button>
        </div>
      )}
    </div>
  )
}