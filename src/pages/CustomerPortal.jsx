import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { 
  MapPin, Calendar, CheckCircle2, Circle, Clock, Loader2, 
  Hammer, MessageSquare, Image as ImageIcon, Send, DollarSign
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { APP_CONFIG } from '../config' 

export default function CustomerPortal() {
  const { token } = useParams()
  const [message, setMessage] = useState('')
  const [file, setFile] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['portal_project', token],
    queryFn: async () => {
      // NOTE: get_project_by_token usually returns select * so 'estimate' should be there if table is updated
      const { data, error } = await supabase.rpc('get_project_by_token', { token_input: token }).single()
      if (error) throw error
      return data
    }
  })

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

  if (isLoading) return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-amber-500 mb-4" size={40} /><p className="text-slate-500 font-medium">Loading project details...</p></div>
  if (error || !project) return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center"><h2 className="text-2xl font-bold text-slate-900 mb-2">Project Not Found</h2><p className="text-slate-500">The link may be invalid or expired.</p></div>

  const getStepStatus = (stepName) => {
    const statusMap = { 'New': 0, 'Scheduled': 1, 'In Progress': 2, 'Completed': 3 }
    const currentStep = statusMap[project.status] || 0
    const thisStep = statusMap[stepName]
    if (currentStep > thisStep) return 'completed'
    if (currentStep === thisStep) return 'current'
    return 'pending'
  }

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* BRAND HEADER */}
        <div className="text-center">
          <div className="bg-amber-500 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/20"><Hammer size={24} className="text-white" /></div>
          <h1 className="text-2xl font-extrabold text-slate-900">{APP_CONFIG.appName}</h1>
          <p className="text-slate-500 text-sm">Client Portal</p>
        </div>

        {/* MAIN STATUS CARD */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          <div className={`p-6 text-center border-b ${project.status === 'Completed' ? 'bg-green-50' : project.status === 'In Progress' ? 'bg-amber-50' : 'bg-slate-50'}`}>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Current Status</p>
            <h2 className={`text-3xl font-black ${project.status === 'Completed' ? 'text-green-700' : project.status === 'In Progress' ? 'text-amber-600' : 'text-slate-800'}`}>{project.status}</h2>
          </div>

          <div className="p-8">
            <h3 className="text-xl font-bold text-slate-900 mb-1">{project.name}</h3>
            {project.customer_name && <p className="text-slate-500 mb-6">Prepared for {project.customer_name}</p>}

            {/* ESTIMATE DISPLAY */}
            {project.estimate > 0 && (
               <div className="mb-8 bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between shadow-lg shadow-slate-900/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><DollarSign size={20} className="text-amber-400" /></div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Project Estimate</p>
                      <p className="font-bold text-white">Quoted Price</p>
                    </div>
                  </div>
                  <p className="text-2xl font-mono font-bold tracking-tight text-amber-400">${Number(project.estimate).toFixed(2)}</p>
               </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <Calendar className="text-amber-500 shrink-0" size={24} />
                <div><p className="text-xs font-bold text-slate-400 uppercase">Start Date</p><p className="font-bold text-slate-700">{project.start_date ? format(parseISO(project.start_date), 'MMMM do, yyyy') : 'TBD'}</p></div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <MapPin className="text-amber-500 shrink-0" size={24} />
                <div><p className="text-xs font-bold text-slate-400 uppercase">Location</p><p className="font-bold text-slate-700">{project.city || 'Local Area'}</p></div>
              </div>
            </div>

            <div className="relative pl-4 border-t border-slate-100 pt-8">
              <div className="absolute left-8 top-8 bottom-0 w-0.5 bg-slate-100"></div>
              <TimelineItem status={getStepStatus('New')} title="Project Created" desc="We have received your project details." />
              <TimelineItem status={getStepStatus('Scheduled')} title="Scheduled" desc="Your project dates are locked in." />
              <TimelineItem status={getStepStatus('In Progress')} title="Construction Underway" desc="Our crew is currently working on-site." />
              <TimelineItem status={getStepStatus('Completed')} title="Project Completed" desc="All work finished." isLast />
            </div>
          </div>
        </div>

        {/* FEEDBACK & UPLOAD SECTION */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600"><MessageSquare size={20} /></div>
            <div><h3 className="font-bold text-slate-900 text-lg">Message the Crew</h3><p className="text-slate-500 text-sm">Have a question or want to share a photo?</p></div>
          </div>
          {feedbackSent ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center animate-in zoom-in duration-300">
              <CheckCircle2 size={40} className="text-green-600 mx-auto mb-2" />
              <h4 className="font-bold text-green-800">Message Sent!</h4>
              <p className="text-green-700 text-sm">The team has been notified.</p>
              <button onClick={() => setFeedbackSent(false)} className="mt-4 text-xs font-bold uppercase text-green-800 underline">Send Another</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <textarea className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none min-h-[100px]"
                placeholder="e.g. Could we make sure the walkway curves around the big oak tree?" value={message} onChange={e => setMessage(e.target.value)} />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold text-slate-600 transition-colors">
                  {file ? <CheckCircle2 size={16} className="text-green-500"/> : <ImageIcon size={16} />} {file ? 'Photo Attached' : 'Attach Photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => setFile(e.target.files[0])} />
                </label>
                {file && <button type="button" onClick={() => setFile(null)} className="text-xs text-red-400 hover:text-red-600">Remove</button>}
              </div>
              <button type="submit" disabled={isSubmitting || (!message && !file)} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send size={18} /> Send Message</>}
              </button>
            </form>
          )}
        </div>
        <div className="text-center text-slate-400 text-xs">&copy; {new Date().getFullYear()} {APP_CONFIG.appName}. All rights reserved.</div>
      </div>
    </div>
  )
}

function TimelineItem({ status, title, desc, isLast }) {
  let Icon = Circle
  let colorClass = "text-slate-300 bg-white border-slate-300"
  if (status === 'completed') { Icon = CheckCircle2; colorClass = "text-green-600 bg-green-50 border-green-200" } 
  else if (status === 'current') { Icon = Clock; colorClass = "text-amber-600 bg-amber-50 border-amber-200 animate-pulse" }
  return (
    <div className={`relative pl-12 ${!isLast ? 'mb-8' : ''}`}>
      <div className={`absolute left-0 w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 ${colorClass}`}><Icon size={16} /></div>
      <div><h4 className={`font-bold ${status === 'pending' ? 'text-slate-400' : 'text-slate-900'}`}>{title}</h4><p className="text-sm text-slate-500">{desc}</p></div>
    </div>
  )
}