import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, parseISO, addDays, differenceInCalendarDays, startOfMonth, endOfMonth, setDate, differenceInMinutes } from 'date-fns' // <--- Updated imports
import { DollarSign, Clock, Calendar } from 'lucide-react' // <--- Updated icons
import TimeClock from '../components/TimeClock'

export default function Dashboard() {
  const { user, userProfile } = useAuth() // Added 'user' to get ID reliably
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  
  // NEW: Payroll Stats State
  const [stats, setStats] = useState({ hours: 0, daysUntilPay: 0, payDate: null, periodLabel: 'Loading...' })

  // 1. FETCH ACTIVE PROJECTS (Existing Logic)
  useEffect(() => {
    fetchActiveProjects()
  }, [])

  async function fetchActiveProjects() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('projects')
        .select(`*, customer:customers (name)`)
        .in('status', ['New', 'scheduled', 'in_progress', 'paused', 'In Progress']) 
        .order('start_date', { ascending: true, nullsFirst: false })
        .limit(5)

      if (error) throw error
      setProjects(data || [])
    } catch (error) {
      console.error('Error fetching projects:', error.message)
    } finally {
      setLoading(false)
    }
  }

  // 2. NEW: FETCH PAYROLL DATA (The Widget Logic)
  useEffect(() => {
    async function fetchPayrollData() {
      if (!user) return

      // A. Get Payroll Settings
      const { data: settings } = await supabase.from('app_settings').select('setting_value').eq('setting_key', 'payroll_config').single()
      const config = settings?.setting_value || { frequency: 'biweekly', anchor_date: '2025-01-10', pay_delay: 7 }

      // B. Calculate Current Period Range based on TODAY
      const today = new Date()
      let start, end
      
      if (config.frequency === 'monthly') {
        start = startOfMonth(today); end = endOfMonth(today);
      } else if (config.frequency === 'semimonthly') {
        const day = today.getDate()
        if (day <= 15) { start = startOfMonth(today); end = setDate(today, 15); }
        else { start = setDate(today, 16); end = endOfMonth(today); }
      } else {
        // Weekly / Bi-Weekly Logic
        const anchor = parseISO(config.anchor_date)
        const freqDays = config.frequency === 'weekly' ? 7 : 14 
        const diffTime = today.getTime() - anchor.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24))
        const periodIndex = Math.floor(diffDays / freqDays)
        start = addDays(anchor, periodIndex * freqDays)
        end = addDays(start, freqDays - 1)
      }

      // C. Calculate Pay Date (End of Period + Pay Delay)
      const payDate = addDays(end, parseInt(config.pay_delay || 7))
      const daysUntil = differenceInCalendarDays(payDate, today)

      // D. Fetch User's Hours for THIS Period
      const { data: logs } = await supabase.from('time_logs')
        .select('clock_in_time, clock_out_time')
        .eq('user_id', user.id)
        .gte('clock_in_time', start.toISOString())
        .lte('clock_in_time', end.toISOString())
      
      const totalMinutes = logs?.reduce((sum, log) => {
        if (!log.clock_out_time) return sum
        return sum + differenceInMinutes(parseISO(log.clock_out_time), parseISO(log.clock_in_time))
      }, 0) || 0

      setStats({
        hours: (totalMinutes / 60).toFixed(1),
        daysUntilPay: daysUntil,
        payDate: payDate,
        periodLabel: `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`
      })
    }

    fetchPayrollData()
  }, [user])

  const getStatusColor = (status) => {
    const s = status?.toLowerCase() || ''
    if (s === 'completed') return 'bg-green-100 text-green-700'
    if (s.includes('progress')) return 'bg-amber-100 text-amber-800'
    if (s === 'scheduled' || s === 'new') return 'bg-blue-100 text-blue-700'
    return 'bg-slate-100 text-slate-600'
  }

  const formatStatus = (status) => {
    if (!status) return ''
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  }

  return (
    <div className="p-4 md:p-10 max-w-6xl mx-auto space-y-8">
      
      {/* 1. HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">
            Welcome back, <span className="font-bold text-slate-700">{userProfile?.full_name || 'Crew Member'}</span>
          </p>
        </div>
        <Link 
          to="/projects/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-sm transition-colors font-bold"
        >
          + New Project
        </Link>
      </div>

      {/* 2. TIME CLOCK & PAYROLL WIDGET */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Time Clock */}
        <div className="lg:col-span-1">
          <TimeClock />
        </div>
        
        {/* NEW: PAYROLL WIDGET (Replaces old Stats Card) */}
        <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 text-white shadow-sm border border-slate-700 flex flex-col justify-between relative overflow-hidden">
          {/* Decorative Background */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10"></div>
          
          <div className="flex justify-between items-start z-10">
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                <Clock size={14} className="text-amber-500"/> Current Pay Period
              </p>
              <p className="text-slate-300 text-sm">{stats.periodLabel}</p>
            </div>
            <div className="text-right">
              <div className="bg-white/10 border border-white/10 px-3 py-1 rounded-lg">
                <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">Pay Day</p>
                <p className="text-lg font-bold text-white">
                  {stats.payDate ? format(stats.payDate, 'MMM d') : '...'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-end justify-between z-10">
            <div>
              <p className="text-5xl font-black text-white tracking-tight">{stats.hours}</p>
              <p className="text-slate-400 text-sm font-medium mt-1">Hours Worked</p>
            </div>
            
            <div className="text-right">
              <span className={`text-sm font-bold px-3 py-1.5 rounded-full border ${stats.daysUntilPay <= 3 ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
                {stats.daysUntilPay} Days Until Payday
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ACTIVE PROJECTS LIST */}
      <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800">Upcoming & Active Jobs</h2>
          <Link to="/projects" className="text-blue-600 hover:text-blue-800 text-sm font-bold">
            View All &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No active jobs found. <Link to="/projects/new" className="text-blue-600 font-bold hover:underline">Create one?</Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {projects.map((proj) => (
              <div key={proj.id} className="p-6 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-6 group">
                
                {/* Project Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {proj.customer?.name || 'Unknown Client'}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${getStatusColor(proj.status)} bg-opacity-50`}>
                      {formatStatus(proj.status)}
                    </span>
                  </div>
                  <p className="text-slate-600 text-sm mb-1 font-medium">{proj.address}</p>
                  <p className="text-slate-400 text-xs italic">
                    {proj.name || 'No description provided'}
                  </p>
                </div>

                {/* Project Details (Dates) */}
                <div className="flex items-center gap-6 text-sm text-slate-600">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Date</p>
                    <p className="font-bold text-slate-700">
                      {proj.start_date ? format(parseISO(proj.start_date), 'MMM d, yyyy') : 'TBD'}
                    </p>
                  </div>
                </div>

                {/* Action Button */}
                <div>
                  <Link 
                    to={`/projects/${proj.id}`}
                    className="inline-flex items-center justify-center px-4 py-2 border border-slate-200 shadow-sm text-sm font-bold rounded-lg text-slate-600 bg-white hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all"
                  >
                    View Details
                  </Link>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}