import React, { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { 
  MapPin, Calendar, CheckCircle2, Circle, Clock, Loader2, 
  Hammer, MessageSquare, Image as ImageIcon, Send, DollarSign, Sparkles, Phone, Mail, LayoutDashboard
} from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { APP_CONFIG } from '../config' 

export default function CustomerPortal() {
  const { token } = useParams()
  const [message, setMessage] = useState('')
  const [file, setFile] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const fileInputRef = useRef(null)

  // 1. DATA FETCHING (Unchanged)
  const { data: project, isLoading, error } = useQuery({
    queryKey: ['portal_project', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_project_by_token', { token_input: token })
      if (error) {
        console.error("Supabase RPC Error:", error)
        throw error
      }
      if (!data || data.length === 0) return null
      return data[0]
    }
  })

  // 2. SUBMIT FEEDBACK (Unchanged)
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim() && !file) return
    setIsSubmitting(true)
    try {
      let imageUrl = null
      if (file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from('portal-uploads').upload(fileName, file)
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('portal-uploads').getPublicUrl(fileName)
        imageUrl = urlData.publicUrl
      }
      const { error } = await supabase.rpc('submit_client_feedback', { p_token: token, p_content: message, p_image_url: imageUrl })
      if (error) throw error
      setFeedbackSent(true); setMessage(''); setFile(null)
    } catch (err) { alert('Error sending message. Please try again.') } 
    finally { setIsSubmitting(false) }
  }

  // 3. LOADING & ERROR STATES
  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center"><Loader2 className="animate-spin text-amber-500 mb-4" size={40} /><p className="text-slate-500 font-medium">Loading your project...</p></div>
  )
  
  if (error || !project) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
      <div className="bg-white/60 backdrop-blur-xl border border-white/60 p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <h2 className="text-2xl font-black text-slate-900 mb-2">Project Not Found</h2>
        <p className="text-slate-500 mb-6">The link may be invalid or expired.</p>
        <p className="text-xs text-slate-400 font-mono bg-slate-100/50 px-3 py-1 rounded-full inline-block">Token: {token}</p>
      </div>
    </div>
  )

  // 4. HELPERS (Unchanged)
  const getStepStatus = (stepName) => {
    const statusMap = { 'New': 0, 'Scheduled': 1, 'In Progress': 2, 'Completed': 3 }
    const currentStep = statusMap[project.status] || 0
    const thisStep = statusMap[stepName]
    if (currentStep > thisStep) return 'completed'
    if (currentStep === thisStep) return 'current'
    return 'pending'
  }

  const daysUntilStart = project.start_date ? differenceInDays(parseISO(project.start_date), new Date()) : 0
  const showCountdown = daysUntilStart > 0 && project.status === 'Scheduled'

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 relative overflow-hidden">
      
      {/* Decorative Background Blobs for the Portal */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[500px] bg-amber-400/10 blur-[100px] rounded-full pointer-events-none -z-10"></div>
      
      <div className="max-w-4xl mx-auto space-y-6 relative z-10">
        
        {/* --- BRAND HEADER --- */}
        <div className="flex flex-col items-center justify-center mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="bg-gradient-to-br from-amber-400 to-amber-600 w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-[0_10px_20px_rgba(245,158,11,0.3)]">
            <Hammer size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">{APP_CONFIG.appName}</h1>
          <div className="flex items-center gap-2 mt-2 bg-white/60 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/60 shadow-sm">
            <LayoutDashboard size={14} className="text-amber-600" />
            <span className="text-slate-600 text-xs font-bold uppercase tracking-widest">Client Portal</span>
          </div>
        </div>

        {/* --- COUNTDOWN BANNER --- */}
        {showCountdown && (
           <div className="relative bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 rounded-[2.5rem] shadow-[0_20px_40px_rgba(245,158,11,0.2)] p-10 text-white text-center overflow-hidden transform hover:scale-[1.01] transition-all duration-500 group animate-in zoom-in-95 duration-500">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay pointer-events-none"></div>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
              
              <div className="relative z-10">
                <div className="flex justify-center mb-4">
                  <div className="bg-white/20 backdrop-blur-md p-3 rounded-2xl border border-white/20 shadow-inner">
                    <Sparkles className="text-yellow-100 animate-pulse w-8 h-8" />
                  </div>
                </div>
                <p className="text-6xl md:text-7xl font-black mb-2 tracking-tighter drop-shadow-md">{daysUntilStart} Days</p>
                <p className="font-bold text-amber-100 uppercase tracking-widest text-sm md:text-base">Until construction begins</p>
              </div>
           </div>
        )}

        {/* --- BENTO BOX GRID --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Bento Item 1: Status Card (Spans 2 columns) */}
          <div className="md:col-span-2 bg-white/70 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/80 p-8 flex flex-col justify-center relative overflow-hidden group hover:shadow-[0_15px_40px_rgb(0,0,0,0.08)] transition-all duration-500">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-gradient-to-br from-amber-400/20 to-orange-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
            
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Current Status</p>
            <h2 className={`text-4xl md:text-5xl font-black tracking-tight mb-6 ${
              project.status === 'Completed' ? 'text-green-600' : 
              project.status === 'In Progress' ? 'text-amber-500' : 'text-slate-800'
            }`}>
              {project.status}
            </h2>
            
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{project.name}</h3>
              {project.customer_name && <p className="text-slate-500 font-medium">Prepared for {project.customer_name}</p>}
            </div>
          </div>

          {/* Bento Item 2: Estimate Card (Dark Glass) */}
          {Number(project.estimate) > 0 && (
            <div className="bg-slate-900/90 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_40px_rgba(0,0,0,0.15)] border border-slate-700/50 p-8 text-white flex flex-col justify-between relative overflow-hidden group hover:-translate-y-1 transition-all duration-500">
              <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-50 pointer-events-none"></div>
              
              <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
                    <DollarSign size={24} className="text-green-400" />
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Est. Cost</p>
              </div>
              
              <div className="relative z-10">
                <div className="text-3xl lg:text-4xl font-black tracking-tighter text-white">
                   ${Number(project.estimate).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </div>
              </div>
            </div>
          )}

          {/* Bento Item 3: Details (Date & Location) */}
          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 p-6 flex items-center gap-5 hover:bg-white/80 transition-colors duration-300">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                <Calendar className="text-amber-600" size={26} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Start Date</p>
                <p className="font-black text-lg text-slate-800">{project.start_date ? format(parseISO(project.start_date), 'MMMM do, yyyy') : 'TBD'}</p>
              </div>
            </div>

            <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 p-6 flex items-center gap-5 hover:bg-white/80 transition-colors duration-300">
              <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
                <MapPin className="text-blue-600" size={26} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Location</p>
                <p className="font-black text-lg text-slate-800">{project.city || 'Local Area'}</p>
              </div>
            </div>
          </div>

          {/* Bento Item 4: Timeline */}
          <div className="md:col-span-3 bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 p-8 lg:p-10">
            <h3 className="text-xl font-bold text-slate-900 mb-8">Project Timeline</h3>
            <div className="relative pl-6">
              {/* Vertical Line */}
              <div className="absolute left-8 top-4 bottom-4 w-1 bg-slate-100 rounded-full"></div>
              
              <TimelineItem status={getStepStatus('New')} title="Project Created" desc="We have received your project details." />
              <TimelineItem status={getStepStatus('Scheduled')} title="Scheduled" desc="Your project dates are locked in." />
              <TimelineItem status={getStepStatus('In Progress')} title="Construction Underway" desc="Our crew is currently working on-site." />
              <TimelineItem status={getStepStatus('Completed')} title="Project Completed" desc="All work finished." isLast />
            </div>
          </div>
        </div>

        {/* --- FEEDBACK & UPLOAD SECTION --- */}
        <div className="bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/60 p-8 lg:p-10 relative overflow-hidden">
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex items-center gap-4 mb-6 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-[0_10px_20px_rgba(59,130,246,0.3)] shrink-0">
              <MessageSquare size={24} />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-xl lg:text-2xl">Message the Crew</h3>
              <p className="text-slate-500 font-medium">Have a question or want to share a photo?</p>
            </div>
          </div>

          {feedbackSent ? (
            <div className="bg-green-50/80 backdrop-blur-sm border border-green-200/50 rounded-3xl p-8 text-center animate-in zoom-in duration-500 relative z-10">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={40} className="text-green-600" />
              </div>
              <h4 className="text-xl font-black text-green-900 mb-2">Message Sent!</h4>
              <p className="text-green-700 font-medium mb-6">The team has been notified and will review it shortly.</p>
              <button 
                onClick={() => setFeedbackSent(false)} 
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-2xl transition-all duration-300 hover:shadow-[0_10px_20px_rgba(22,163,74,0.3)] active:scale-95"
              >
                Send Another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
              <textarea 
                className="w-full p-5 bg-white/50 backdrop-blur-md border border-slate-200/80 rounded-3xl focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none min-h-[140px] text-slate-800 placeholder-slate-400 transition-all duration-300 resize-none shadow-inner"
                placeholder="e.g. Could we make sure the walkway curves around the big oak tree?" 
                value={message} 
                onChange={e => setMessage(e.target.value)} 
              />
              
              {file && (
                <div className="bg-slate-100/50 backdrop-blur-sm p-3 rounded-2xl border border-slate-200 flex items-center justify-between animate-in slide-in-from-bottom-2">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-blue-500">
                        <ImageIcon size={18} />
                      </div>
                      <span className="text-sm font-bold text-slate-700 truncate max-w-[200px]">{file.name}</span>
                   </div>
                   <button type="button" onClick={() => { setFile(null); if(fileInputRef.current) fileInputRef.current.value = ''; }} className="text-slate-400 hover:text-red-500 p-2 bg-white rounded-xl shadow-sm transition-colors">
                      <X size={16} />
                   </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 bg-slate-100/80 hover:bg-slate-200 backdrop-blur-md border border-slate-200 px-6 py-4 rounded-2xl text-slate-700 font-bold transition-all duration-300 active:scale-95"
                >
                  <ImageIcon size={20} className="text-slate-500" />
                  Attach Photo
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept="image/*" 
                  className="hidden" 
                  onChange={e => setFile(e.target.files[0])} 
                />

                <button 
                  type="submit" 
                  disabled={isSubmitting || (!message && !file)} 
                  className="w-full sm:w-auto flex-[2] bg-gradient-to-b from-slate-800 to-slate-950 hover:from-slate-700 hover:to-slate-900 text-white font-bold py-4 px-8 rounded-2xl flex justify-center items-center gap-2 shadow-[0_10px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_15px_30px_rgba(0,0,0,0.3)] active:scale-[0.97] transition-all duration-300 disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send size={20} /> Send Message</>}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* --- COMPANY CONTACT FOOTER --- */}
        <div className="text-center space-y-6 pt-10 pb-6">
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Questions? Contact us anytime.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="mailto:Adam@pavingstone.pro" className="flex items-center gap-3 text-slate-700 hover:text-amber-600 transition-colors font-bold bg-white/60 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/60 shadow-sm hover:shadow-md">
              <Mail size={18} className="text-slate-400" /> Adam@pavingstone.pro
            </a>
            <a href="tel:2048036464" className="flex items-center gap-3 text-slate-700 hover:text-amber-600 transition-colors font-bold bg-white/60 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/60 shadow-sm hover:shadow-md">
              <Phone size={18} className="text-slate-400" /> (204) 803-6464
            </a>
          </div>
          <div className="text-slate-400/60 font-bold text-xs pt-8">
            &copy; {new Date().getFullYear()} {APP_CONFIG.appName}. All rights reserved.
          </div>
        </div>

      </div>
    </div>
  )
}

// --- TIMELINE COMPONENT (2026 Style Update) ---
function TimelineItem({ status, title, desc, isLast }) {
  let Icon = Circle
  let colorClass = "text-slate-300 bg-white border-slate-200"
  let lineClass = "bg-slate-200"
  let titleClass = "text-slate-400"

  if (status === 'completed') { 
    Icon = CheckCircle2
    colorClass = "text-green-500 bg-green-50 border-green-200 shadow-[0_0_15px_rgba(34,197,94,0.2)]"
    lineClass = "bg-green-500"
    titleClass = "text-slate-900"
  } else if (status === 'current') { 
    Icon = Clock
    colorClass = "text-amber-500 bg-amber-50 border-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.4)]"
    titleClass = "text-slate-900 font-black"
  }

  return (
    <div className={`relative pl-14 ${!isLast ? 'mb-10' : ''}`}>
      {/* Node */}
      <div className={`absolute left-0 top-0 w-12 h-12 rounded-2xl border flex items-center justify-center z-10 transition-all duration-500 ${colorClass} ${status === 'current' ? 'animate-pulse' : ''}`}>
        <Icon size={24} />
      </div>
      
      {/* Connecting Line */}
      {!isLast && (
        <div className={`absolute left-6 top-12 bottom-[-40px] w-1 rounded-full transition-colors duration-500 -ml-[2px] ${status === 'completed' ? 'bg-green-500/50' : 'bg-slate-200/50'}`}></div>
      )}

      {/* Content */}
      <div className="pt-2">
        <h4 className={`text-lg transition-colors duration-300 ${status === 'current' ? 'font-black text-slate-900' : 'font-bold ' + titleClass}`}>{title}</h4>
        <p className="text-slate-500 mt-1 font-medium">{desc}</p>
      </div>
    </div>
  )
}
