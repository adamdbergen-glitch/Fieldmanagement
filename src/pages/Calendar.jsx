import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar as BigCalendar, dateFnsLocalizer, Views } from 'react-big-calendar'
// 1. IMPORT DRAG AND DROP ADDONS
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import format from 'date-fns/format'
import parse from 'date-fns/parse'
import startOfWeek from 'date-fns/startOfWeek'
import getDay from 'date-fns/getDay'
import enUS from 'date-fns/locale/en-US'
import { differenceInCalendarDays } from 'date-fns' 

// 2. IMPORT STYLES
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'

import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { can, PERMISSIONS } from '../lib/permissions'
import { addWorkDays, shiftDateByWorkDays } from '../lib/dateUtils'
import { AlertTriangle, Loader, Check } from 'lucide-react'

// Setup Date Localizer
const locales = { 'en-US': enUS }
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

// 3. INITIALIZE DRAGGABLE CALENDAR
const DnDCalendar = withDragAndDrop(BigCalendar)

export default function Calendar() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [view, setView] = useState(Views.MONTH)

  // Permission Check
  const canEdit = can(userProfile?.role, PERMISSIONS.CAN_EDIT_PROJECT)

  useEffect(() => {
    if (userProfile) {
      if (userProfile.role === 'crew') setView(Views.AGENDA)
      fetchSchedule()
    }
  }, [userProfile])

  async function fetchSchedule() {
    try {
      setLoading(true)
      let query = supabase
        .from('projects')
        .select('*, customer:customers(name)')
        .neq('status', 'Completed')

      if (userProfile.role === 'crew') {
         const twoWeeksAgo = new Date()
         twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
         query = query.gte('start_date', twoWeeksAgo.toISOString())
      }

      const { data, error } = await query
      if (error) throw error

      const formattedEvents = data.map(proj => {
        if (!proj.start_date) return null
        
        const startDate = new Date(proj.start_date)
        const duration = proj.duration_days ? parseInt(proj.duration_days) : 1
        
        // Calculate End Date
        const endDate = addWorkDays(startDate, duration)

        return {
          id: proj.id,
          title: `${proj.customer?.name || 'Client'} - ${proj.name}`,
          start: startDate,
          end: endDate,
          status: proj.status,
          city: proj.city,
          duration_days: duration, 
          resource: proj
        }
      }).filter(Boolean)

      setEvents(formattedEvents)
    } catch (error) {
      console.error('Error fetching schedule:', error)
    } finally {
      setLoading(false)
    }
  }

  // --- 4. DRAG & DROP HANDLER (Move Event) ---
  const moveEvent = useCallback(async ({ event, start, end }) => {
    if (!canEdit) return; // Security Check

    // Optimistic Update (Make it feel fast)
    const oldEvents = [...events]
    setEvents((prev) => {
      const existing = prev.find((ev) => ev.id === event.id) ?? {}
      const filtered = prev.filter((ev) => ev.id !== event.id)
      return [...filtered, { ...existing, start, end }]
    })

    try {
      // We update the Start Date. 
      const newStartISO = start.toISOString()

      const { error } = await supabase
        .from('projects')
        .update({ start_date: newStartISO })
        .eq('id', event.id)

      if (error) throw error

    } catch (error) {
      alert("Failed to move job: " + error.message)
      setEvents(oldEvents) // Revert on failure
    }
  }, [events, canEdit])

  // --- 5. RESIZE HANDLER (Stretch Event) ---
  const resizeEvent = useCallback(async ({ event, start, end }) => {
    if (!canEdit) return;

    // Optimistic Update
    const oldEvents = [...events]
    setEvents((prev) => {
      const existing = prev.find((ev) => ev.id === event.id) ?? {}
      const filtered = prev.filter((ev) => ev.id !== event.id)
      return [...filtered, { ...existing, start, end }]
    })

    try {
      // Calculate new duration in days
      const daysDiff = differenceInCalendarDays(end, start)
      const newDuration = Math.max(1, daysDiff)

      const { error } = await supabase
        .from('projects')
        .update({ 
          start_date: start.toISOString(),
          duration_days: newDuration 
        })
        .eq('id', event.id)

      if (error) throw error

    } catch (error) {
      alert("Failed to resize job: " + error.message)
      setEvents(oldEvents)
    }
  }, [events, canEdit])


  // --- RAIN DELAY / SCHEDULE SHIFT (OPTIMIZED) ---
  const handleScheduleShift = async (days) => {
    const direction = days > 0 ? "Forward (+1 Day)" : "Backward (-1 Day)"
    if (!window.confirm(`SCHEDULE SHIFT PROTOCOL:\n\nThis will move ALL future/active jobs ${direction}.\n(Fridays/Weekends will be skipped automatically).\n\nAre you sure?`)) return

    setProcessing(true)
    
    // 1. Snapshot current state for rollback
    const oldEvents = [...events]

    try {
      const today = new Date()
      today.setHours(0,0,0,0) // Reset time to midnight for comparison

      // 2. OPTIMISTIC UPDATE: Move UI immediately
      const updatedEvents = events.map(ev => {
        // Only move events that start TODAY or in the FUTURE
        if (ev.start >= today && ev.status !== 'Completed') {
           const newStartISO = shiftDateByWorkDays(ev.start.toISOString(), days)
           const newStart = new Date(newStartISO)
           // Recalculate End Date based on duration
           const newEnd = addWorkDays(newStart, ev.duration_days || 1)
           
           return { ...ev, start: newStart, end: newEnd }
        }
        return ev
      })
      
      setEvents(updatedEvents) // Update screen instantly

      // 3. DATABASE UPDATE (Parallel Processing)
      const todayStr = new Date().toISOString().split('T')[0]
      const { data: activeProjects } = await supabase
        .from('projects')
        .select('id, start_date')
        .neq('status', 'Completed')
        .gte('start_date', todayStr)

      if (!activeProjects?.length) {
        setProcessing(false)
        return
      }

      // Fire all updates at once instead of waiting for each one
      const updates = activeProjects.map(proj => {
        const newStart = shiftDateByWorkDays(proj.start_date, days)
        return supabase
          .from('projects')
          .update({ start_date: newStart })
          .eq('id', proj.id)
      })

      await Promise.all(updates)

      // 4. Silent Refresh (Sync with server to be safe)
      fetchSchedule()

    } catch (error) {
      console.error(error)
      alert("Error shifting schedule: " + error.message)
      setEvents(oldEvents) // Revert UI if DB fails
    } finally {
      setProcessing(false)
    }
  }

  const eventStyleGetter = (event) => {
    let backgroundColor = '#3b82f6'
    if (event.status === 'In Progress') backgroundColor = '#f59e0b'
    if (event.status === 'Paused') backgroundColor = '#ef4444'
    
    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.9,
        color: 'white',
        border: '0px',
        display: 'block',
        fontSize: '0.85rem'
      }
    }
  }

  if (loading) return <div className="p-10 flex justify-center"><Loader className="animate-spin text-slate-400" /></div>

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col p-6 max-w-[1600px] mx-auto">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Schedule</h1>
          <p className="text-slate-500 text-sm">
            {userProfile?.role === 'crew' 
              ? 'Crew View (Next 2 Weeks)' 
              : `Master Schedule (${events.length} Active Jobs)`}
          </p>
        </div>

        {can(userProfile?.role, PERMISSIONS.CAN_MANAGE_CREW) && (
          <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase px-2">Global Shift:</span>
            <button onClick={() => handleScheduleShift(-1)} disabled={processing} className="px-3 py-1 hover:bg-slate-100 rounded text-slate-600 font-bold text-sm" title="Pull Schedule Back 1 Day">-1 Day</button>
            <div className="w-px h-4 bg-slate-200"></div>
            <button 
              onClick={() => handleScheduleShift(1)} 
              disabled={processing} 
              className={`flex items-center gap-2 px-3 py-1 rounded font-bold text-sm transition-colors ${processing ? 'bg-amber-100 text-amber-600' : 'bg-red-50 text-red-600 hover:bg-red-100'}`} 
              title="Rain Delay: Push Schedule Forward 1 Day"
            >
              {processing ? <Loader size={14} className="animate-spin"/> : <AlertTriangle size={14} />} 
              {processing ? 'Shifting...' : 'Rain Delay (+1 Day)'}
            </button>
          </div>
        )}
      </div>

      {/* CALENDAR */}
      <div className="flex-1 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
        <DnDCalendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          
          views={['month', 'agenda']}
          view={view}
          onView={setView}
          length={14} 
          
          // --- ENABLE DRAG AND DROP ---
          onEventDrop={moveEvent}
          onEventResize={resizeEvent}
          draggableAccessor={() => canEdit} // Only admins drag
          resizableAccessor={() => canEdit} // Only admins resize
          
          onSelectEvent={(event) => navigate(`/projects/${event.id}`)}
          eventPropGetter={eventStyleGetter}
          popup
          selectable={false} 
        />
      </div>
      
      <div className="mt-4 flex gap-4 justify-center text-xs text-slate-500">
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm"></span> Scheduled</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500 rounded-sm"></span> In Progress</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-sm"></span> Paused</div>
        {canEdit && <div className="flex items-center gap-1 ml-4 text-slate-400 italic">Drag to move • Drag right edge to resize</div>}
      </div>

    </div>
  )
}