import React, { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { 
  TrendingUp, Building, Plus, Trash2, AlertCircle, ArrowUpRight, FileText, Calendar 
} from 'lucide-react'
import { format, parseISO, isValid } from 'date-fns'

// CONFIG: How much extra does an employee cost? (CPP, EI, WCB, etc.)
// 1.20 means 20% on top of hourly wage.
const LABOR_BURDEN = 1.20 

export default function Financials() {
  const [activeTab, setActiveTab] = useState('profitability')
  const queryClient = useQueryClient()

  // --- TAB 1: JOB PROFITABILITY DATA ---
  const { data: jobData, isLoading: loadingJobs } = useQuery({
    queryKey: ['financials_jobs'],
    queryFn: async () => {
      // 1. Fetch Completed Projects
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, estimate, start_date, status, customer:customers(name)')
        .eq('status', 'Completed')
        .not('estimate', 'is', null)

      if (!projects?.length) return []

      // 2. Fetch All Expenses linked to these projects
      const { data: expenses } = await supabase
        .from('project_expenses')
        .select('project_id, amount')
        .in('project_id', projects.map(p => p.id))

      // 3. Fetch All Time Logs linked to these projects + User Wages
      const { data: logs } = await supabase
        .from('time_logs')
        .select('project_id, clock_in_time, clock_out_time, profile:user_id(wage)')
        .in('project_id', projects.map(p => p.id))
        .not('clock_out_time', 'is', null)

      // 4. MERGE DATA
      return projects.map(proj => {
        // A. Sum Expenses
        const matCost = expenses
          .filter(e => e.project_id === proj.id)
          .reduce((sum, e) => sum + Number(e.amount), 0)

        // B. Calc Labor (Duration * Wage * Burden)
        const labCost = logs
          .filter(l => l.project_id === proj.id)
          .reduce((sum, log) => {
            const start = new Date(log.clock_in_time)
            const end = new Date(log.clock_out_time)
            const hours = (end - start) / 36e5 // ms to hours
            const wage = log.profile?.wage || 20 // Default $20 if missing
            return sum + (hours * wage * LABOR_BURDEN)
          }, 0)

        const revenue = Number(proj.estimate) || 0
        const totalCost = matCost + labCost
        const profit = revenue - totalCost
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0

        return { ...proj, matCost, labCost, profit, margin }
      }).sort((a, b) => {
        const dateA = a.start_date || ''
        const dateB = b.start_date || ''
        return dateB.localeCompare(dateA)
      }) 
    }
  })

  // --- TAB 2: OVERHEAD DATA ---
  const { data: overheads, isLoading: loadingOverhead } = useQuery({
    queryKey: ['overhead_expenses'],
    queryFn: async () => {
      const { data } = await supabase.from('overhead_expenses').select('*').order('amount', { ascending: false })
      return data || []
    }
  })

  // --- TAB 3: MONTHLY REPORTS LOGIC ---
  const monthlyOverhead = overheads?.reduce((sum, item) => sum + Number(item.amount), 0) || 0
  const dailyNut = monthlyOverhead / 21.6 

  const monthlyReports = useMemo(() => {
    if (!jobData) return []
    
    // Group jobs by "Month Year" (e.g., "October 2023")
    const groups = jobData.reduce((acc, job) => {
      const date = parseISO(job.start_date)
      const key = isValid(date) ? format(date, 'MMMM yyyy') : 'Unknown Date'
      
      if (!acc[key]) {
        acc[key] = { 
          month: key, 
          revenue: 0, 
          cogs: 0, // Cost of Goods Sold (Labor + Mat)
          jobCount: 0,
          jobs: [] 
        }
      }
      
      acc[key].revenue += Number(job.estimate)
      acc[key].cogs += (job.matCost + job.labCost)
      acc[key].jobCount += 1
      acc[key].jobs.push(job.name)
      return acc
    }, {})

    // Convert to array and calculate Net Profit
    return Object.values(groups).map(group => {
      const grossProfit = group.revenue - group.cogs
      const netProfit = grossProfit - monthlyOverhead // Deduct fixed overhead
      const margin = group.revenue > 0 ? (netProfit / group.revenue) * 100 : 0
      
      return { ...group, grossProfit, netProfit, margin }
    })
    // Sort by date (we need a hacky way to sort "October 2023" vs "November 2023")
    // For now, relies on the insert order if jobData is sorted by date
  }, [jobData, monthlyOverhead])

  // --- ACTIONS ---
  const handleAddOverhead = async (e) => {
    e.preventDefault()
    const name = e.target.name.value
    const amount = e.target.amount.value
    if (!name || !amount) return

    await supabase.from('overhead_expenses').insert({ name, amount })
    queryClient.invalidateQueries(['overhead_expenses'])
    e.target.reset()
  }

  const handleDeleteOverhead = async (id) => {
    await supabase.from('overhead_expenses').delete().eq('id', id)
    queryClient.invalidateQueries(['overhead_expenses'])
  }

  const formatDateSafe = (dateStr) => {
    if (!dateStr) return 'No Date'
    const date = parseISO(dateStr)
    return isValid(date) ? format(date, 'MMM yyyy') : 'Invalid Date'
  }

  // --- HELPERS ---
  const bestJobs = jobData ? [...jobData].sort((a, b) => b.margin - a.margin).slice(0, 3) : []
  const worstJobs = jobData ? [...jobData].sort((a, b) => a.margin - b.margin).slice(0, 3) : []

  if (loadingJobs || loadingOverhead) return <div className="p-10 text-center text-slate-500">Crunching the numbers...</div>

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Financial HQ</h1>
          <p className="text-slate-500">Profitability analysis & overhead tracking.</p>
        </div>
        
        {/* TAB SWITCHER */}
        <div className="bg-white p-1 rounded-lg border border-slate-200 flex shadow-sm overflow-x-auto max-w-full">
          <button onClick={() => setActiveTab('profitability')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'profitability' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-500 hover:text-slate-900'}`}>
            <TrendingUp size={16} /> Job Profitability
          </button>
          <button onClick={() => setActiveTab('monthly')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'monthly' ? 'bg-amber-500 text-slate-900 shadow' : 'text-slate-500 hover:text-slate-900'}`}>
            <FileText size={16} /> Monthly Reports
          </button>
          <button onClick={() => setActiveTab('overhead')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'overhead' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}>
            <Building size={16} /> Overhead
          </button>
        </div>
      </div>

      {/* === TAB 1: JOB PROFITABILITY === */}
      {activeTab === 'profitability' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Gross Profit (YTD)</h3>
              <p className="text-3xl font-black text-slate-900">
                ${jobData?.reduce((sum, j) => sum + j.profit, 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100 shadow-sm">
              <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">Best Performer</h3>
              {bestJobs[0] ? (
                <div>
                  <p className="font-bold text-emerald-900 truncate">{bestJobs[0].name}</p>
                  <p className="text-2xl font-black text-emerald-700">{bestJobs[0].margin.toFixed(1)}% Margin</p>
                </div>
              ) : <p className="text-emerald-400">No data yet</p>}
            </div>
            <div className="bg-red-50 p-6 rounded-xl border border-red-100 shadow-sm">
              <h3 className="text-xs font-bold text-red-600 uppercase tracking-widest mb-2">Needs Improvement</h3>
              {worstJobs[0] ? (
                <div>
                  <p className="font-bold text-red-900 truncate">{worstJobs[0].name}</p>
                  <p className="text-2xl font-black text-red-700">{worstJobs[0].margin.toFixed(1)}% Margin</p>
                </div>
              ) : <p className="text-red-400">No data yet</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Completed Jobs Analysis</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4">Project</th>
                    <th className="px-6 py-4">Est. Revenue</th>
                    <th className="px-6 py-4">Mat. Cost</th>
                    <th className="px-6 py-4">Labor Cost</th>
                    <th className="px-6 py-4">Gross Profit</th>
                    <th className="px-6 py-4 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobData?.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{job.name}</p>
                        <p className="text-xs text-slate-400">
                          {job.customer?.name} • {formatDateSafe(job.start_date)}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-600">${job.estimate.toLocaleString()}</td>
                      <td className="px-6 py-4 text-slate-500">${job.matCost.toLocaleString()}</td>
                      <td className="px-6 py-4 text-slate-500">
                        ${job.labCost.toFixed(0)}
                        <span className="block text-[10px] text-slate-300">Incl. Burden</span>
                      </td>
                      <td className={`px-6 py-4 font-bold ${job.profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${job.profit.toFixed(0)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          job.margin > 40 ? 'bg-green-100 text-green-700' : 
                          job.margin > 20 ? 'bg-amber-100 text-amber-700' : 
                          'bg-red-100 text-red-700'
                        }`}>
                          {job.margin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {jobData?.length === 0 && (
                    <tr><td colSpan="6" className="p-8 text-center text-slate-400 italic">No completed projects found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* === TAB 2: MONTHLY REPORTS (NEW) === */}
      {activeTab === 'monthly' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="text-blue-500 shrink-0" size={20} />
            <div>
              <p className="text-sm font-bold text-blue-900">How this works</p>
              <p className="text-xs text-blue-700 mt-1">
                We sum up the revenue and costs of all jobs completed in a month. 
                Then we subtract your fixed <strong>${monthlyOverhead.toLocaleString()}</strong> overhead to show your true Net Profit.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-900 text-white font-bold uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Month</th>
                  <th className="px-6 py-4">Jobs</th>
                  <th className="px-6 py-4">Revenue</th>
                  <th className="px-6 py-4">Project Costs</th>
                  <th className="px-6 py-4">Gross Profit</th>
                  <th className="px-6 py-4">Fixed Overhead</th>
                  <th className="px-6 py-4 text-right">True Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyReports.map((report) => (
                  <tr key={report.month} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400"/> {report.month}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <span className="font-bold">{report.jobCount}</span>
                      <span className="text-xs text-slate-400 block truncate max-w-[150px]">{report.jobs.join(', ')}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-700">${report.revenue.toLocaleString()}</td>
                    <td className="px-6 py-4 font-mono text-red-400">-${report.cogs.toLocaleString()}</td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-600">${report.grossProfit.toLocaleString()}</td>
                    <td className="px-6 py-4 font-mono text-red-400">-${monthlyOverhead.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`text-lg font-black ${report.netProfit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${report.netProfit.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
                {monthlyReports.length === 0 && (
                  <tr><td colSpan="7" className="p-8 text-center text-slate-400 italic">No data available for reports.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === TAB 3: OVERHEAD === */}
      {activeTab === 'overhead' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4">
          
          {/* LEFT: ADD NEW & LIST */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Plus size={20} /> Add Monthly Cost</h3>
              <form onSubmit={handleAddOverhead} className="flex gap-3">
                <input name="name" placeholder="Expense Name (e.g. Shop Rent)" className="flex-1 p-3 border border-slate-200 rounded-lg bg-slate-50 text-sm font-bold" required />
                <input name="amount" type="number" step="0.01" placeholder="$ Monthly" className="w-32 p-3 border border-slate-200 rounded-lg bg-slate-50 text-sm font-bold" required />
                <button className="bg-slate-900 text-white px-6 rounded-lg font-bold hover:bg-slate-800">Add</button>
              </form>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3">Expense Item</th>
                    <th className="px-6 py-3 text-right">Monthly Cost</th>
                    <th className="px-6 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overheads.map(item => (
                    <tr key={item.id} className="group hover:bg-slate-50">
                      <td className="px-6 py-4 font-bold text-slate-700">{item.name}</td>
                      <td className="px-6 py-4 text-right font-mono text-slate-600">${item.amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleDeleteOverhead(item.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT: THE SUMMARY */}
          <div className="space-y-6">
            <div className="bg-slate-900 text-white p-8 rounded-xl shadow-2xl relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">Total Monthly Overhead</p>
                <h2 className="text-4xl font-black mb-6">${monthlyOverhead.toLocaleString()}</h2>
                
                <div className="h-px bg-slate-700 my-6"></div>
                
                <p className="text-amber-500 font-bold text-xs uppercase tracking-widest mb-1 flex items-center gap-2"><AlertCircle size={14} /> The "Daily Nut"</p>
                <h2 className="text-5xl font-black text-white">${dailyNut.toFixed(0)}</h2>
                <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                  You must generate <strong>${dailyNut.toFixed(0)} in Gross Profit</strong> every single work day just to break even.
                </p>
              </div>
              <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-amber-500/20 rounded-full blur-3xl"></div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2"><ArrowUpRight size={18} /> Pricing Tip</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                If you have a 4-man crew working 20 days/month (640 hours total), you need to add 
                <span className="font-bold text-slate-900 bg-amber-100 px-1 mx-1 rounded">${(monthlyOverhead / 640).toFixed(2)} / hr</span> 
                to every man-hour quoted just to cover these overheads.
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}