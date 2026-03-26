import React, { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { 
  MapPin, Calendar, CheckCircle2, Circle, Clock, Loader2, 
  Hammer, MessageSquare, Image as ImageIcon, Send, DollarSign, Sparkles, Phone, Mail, LayoutDashboard, FileSignature, X
} from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { APP_CONFIG } from '../config' 

const CONTRACT_TERMS = `THE PAVINGSTONE PROS CONTRACT 

1. PARTIES & ACKNOWLEDGMENTS 
1.1 The term "Contractor" refers to The Pavingstone Pros, including any subcontractors or agents acting on its behalf. 
1.2 The "Customer(s)" refers to the individual(s) authorizing work under this agreement. 
1.3 The Customer(s) acknowledge that the Project Estimate is an approximation of the work scope, materials, and associated costs. 

2. PROJECT ESTIMATE & ADJUSTMENTS 
2.1 The estimate is based on Customer-provided information and is subject to seasonal variables, including but not limited to soil conditions, material pricing fluctuations, and weather. 
2.2 The Contractor reserves the right to adjust the estimate accordingly. Any changes will be communicated to the Customer(s) before proceeding. If the Customer(s) do not accept the adjustment, work will cease, and the Customer(s) shall be responsible for payment of all completed work and materials used. 
2.3 Materials ordered but not used are subject to a 15% restocking fee. 

3. PROJECT SCHEDULE & ACCESS 
3.1 Project timelines are subject to change due to external factors, including weather, material availability, and site conditions. The Contractor will provide reasonable updates on scheduling adjustments. 
3.2 The Customer(s) shall provide unrestricted access to the property. Any access limitations may increase costs due to additional labor or equipment needs. 

4. PAYMENT TERMS & DEPOSITS 
4.1 A $500 non-refundable deposit is required upon signing this contract. 
4.2 A 50% pre-payment is required 1-2 weeks before the project start date (or on the day of, if agreed upon). 
4.3 The remaining 50% balance (less the deposit) is due immediately upon project completion. 
4.4 Failure to make payments as agreed may result in work stoppage. The Contractor reserves the right to demand further payment before proceeding. 

5. NON-PAYMENT & PROPERTY LIEN 
5.1 The Contractor retains ownership of all installed materials until full payment is received. If payment is not made by the due date, the Contractor may remove all installed materials without liability for any resulting property damage. 
5.2 In the event of non-payment, the Contractor reserves the right to file a lien against the Customer’s property as security for unpaid balances. 

6. WARRANTY & LIABILITY 
6.1 The Pavingstone Pros provides a 3-year warranty on new installations and a 1-year warranty on repairs. This warranty covers workmanship only and does not extend to natural occurrences (e.g., ground shifting, weather damage, or improper maintenance). 
6.2 No additional warranties, express or implied, are provided beyond those explicitly stated in this agreement. 

7. TERMINATION & CANCELLATION 
7.1 The Contractor may terminate this agreement at any time prior to project commencement due to non-payment of deposits or other concerns. 
7.2 If termination occurs after work has begun, the Customer(s) shall be responsible for payment of all completed work and used materials up to the termination date. 

8. GOVERNING LAW 
8.1 This contract shall be governed by and interpreted in accordance with the laws of the Province of Manitoba and the Country of Canada. Any disputes arising under this agreement shall be resolved within the applicable jurisdiction of Manitoba.`;

export default function CustomerPortal() {
  const { token } = useParams()
  const [message, setMessage] = useState('')
  const [file, setFile] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  
  // Contract State
  const [showContractModal, setShowContractModal] = useState(false)
  const [signatureName, setSignatureName] = useState('')
  const [isApproving, setIsApproving] = useState(false)
  
  const fileInputRef = useRef(null)

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['portal_project', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_project_by_token', { token_input: token })
      if (error) throw error
      if (!data || data.length === 0) return null
      return data[0]
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

  // HANDLE FORMAL APPROVAL (SIGNATURE)
  const handleApprove = async () => {
    if (!signatureName.trim()) return alert("Please type your full name to sign the contract.")
    setIsApproving(true)
    
    try {
      // 1. Generate text blob for the contract
      const contractContent = `SIGNED CONTRACT\n\nProject: ${project.name}\nCustomer: ${signatureName}\nDate: ${new Date().toLocaleString()}\n\n${CONTRACT_TERMS}`;
      const blob = new Blob([contractContent], { type: 'text/plain' });
      const fileName = `${project.id}/Signed_Contract_${Date.now()}.txt`;
      
      // 2. Upload to project-files bucket
      const { error: uploadError } = await supabase.storage.from('project-files').upload(fileName, blob);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('project-files').getPublicUrl(fileName);
      const contractUrl = urlData.publicUrl;

      // 3. Save to project_files table so Adam sees it in the dashboard
      await supabase.from('project_files').insert({
        project_id: project.id,
        file_name: `Signed_Contract_${signatureName.replace(/\s+/g, '_')}.txt`,
        file_url: contractUrl,
        file_type: 'document'
      });

      // 4. Update status in Supabase 
      const { error: statusError } = await supabase
        .from('projects')
        .update({ status: 'Scheduled' }) 
        .eq('id', project.id)
      if (statusError) throw statusError

      // 5. Send Emails (Adam + Client Receipt)
      await fetch('https://pavingstone-chatbot.onrender.com/api/approve-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: signatureName,
          customerEmail: project.customer_email || null,
          projectName: project.name,
          adminLink: `${window.location.origin}/projects/${project.id}`,
          contractUrl: contractUrl
        })
      })

      // 6. Automated Comment
      await supabase.from('project_comments').insert({
        project_id: project.id,
        content: `✅ The client (${signatureName}) has officially approved the estimate for $${Number(project.estimate).toLocaleString()} and signed the contract.`,
        is_from_client: true
      })

      alert("Thank you! Your project has been approved. A copy of the contract has been emailed to you.")
      window.location.reload() 
    } catch (err) {
      alert("There was an issue approving the project: " + err.message)
    } finally {
      setIsApproving(false)
    }
  }

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center"><Loader2 className="animate-spin text-amber-500 mb-4" size={40} /><p className="text-slate-500 font-medium">Loading your project...</p></div>
  )
  
  if (error || !project) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
      <div className="bg-white/60 backdrop-blur-xl border border-white/60 p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <h2 className="text-2xl font-black text-slate-900 mb-2">Project Not Found</h2>
        <p className="text-slate-500 mb-6">The link may be invalid or expired.</p>
      </div>
    </div>
  )

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

  // Is the project currently just an estimate?
  const isEstimatePhase = project.status === 'New'

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 relative overflow-hidden">
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
            <span className="text-slate-600 text-xs font-bold uppercase tracking-widest">
              {isEstimatePhase ? 'Project Estimate' : 'Client Portal'}
            </span>
          </div>
        </div>

        {/* --- COUNTDOWN BANNER --- */}
        {showCountdown && (
           <div className="relative bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 rounded-[2.5rem] shadow-[0_20px_40px_rgba(245,158,11,0.2)] p-10 text-white text-center overflow-hidden transform hover:scale-[1.01] transition-all duration-500 group animate-in zoom-in-95 duration-500">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay pointer-events-none"></div>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Bento Item 1: Status/Title Card */}
          <div className={`${isEstimatePhase ? 'md:col-span-3 text-center items-center' : 'md:col-span-2'} bg-white/70 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/80 p-8 flex flex-col justify-center relative overflow-hidden group hover:shadow-[0_15px_40px_rgb(0,0,0,0.08)] transition-all duration-500`}>
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-gradient-to-br from-amber-400/20 to-orange-500/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
            
            {!isEstimatePhase && <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Current Status</p>}
            
            <h2 className={`${isEstimatePhase ? 'text-3xl' : 'text-4xl md:text-5xl'} font-black tracking-tight mb-6 ${
              project.status === 'Completed' ? 'text-green-600' : 
              project.status === 'In Progress' ? 'text-amber-500' : 'text-slate-800'
            }`}>
              {isEstimatePhase ? `Prepared for ${project.customer_name}` : project.status}
            </h2>
            
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{project.name}</h3>
              {project.scope_of_work && isEstimatePhase && (
                 <p className="text-slate-500 mt-4 whitespace-pre-wrap text-left max-w-2xl mx-auto bg-white/50 p-4 rounded-xl border border-slate-100">{project.scope_of_work}</p>
              )}
            </div>
          </div>

          {/* Bento Item 2: Estimate Card */}
          {Number(project.estimate) > 0 && (
            <div className={`${isEstimatePhase ? 'md:col-span-3 items-center text-center' : ''} bg-slate-900/90 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_40px_rgba(0,0,0,0.15)] border border-slate-700/50 p-8 text-white flex flex-col justify-between relative overflow-hidden group hover:-translate-y-1 transition-all duration-500`}>
              <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-50 pointer-events-none"></div>
              
              <div className={`flex items-center gap-3 mb-6 relative z-10 ${isEstimatePhase ? 'justify-center' : ''}`}>
                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
                    <DollarSign size={24} className="text-green-400" />
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Est. Cost</p>
              </div>
              
              <div className="relative z-10 w-full">
                <div className="text-4xl lg:text-5xl font-black tracking-tighter text-white mb-6">
                   ${Number(project.estimate).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </div>
                
                {isEstimatePhase && (
                  <div className="max-w-md mx-auto">
                    <button 
                      onClick={() => setShowContractModal(true)}
                      className="w-full bg-green-500 hover:bg-green-400 text-slate-900 font-bold py-4 px-6 rounded-xl transition-all shadow-[0_10px_20px_rgba(34,197,94,0.2)] flex items-center justify-center gap-2 text-lg hover:-translate-y-1"
                    >
                      <FileSignature size={22} />
                      Review & Approve Contract
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ONLY SHOW IF APPROVED (Scheduled, In Progress, Completed) */}
          {!isEstimatePhase && (
            <>
              {/* Timeline & Location */}
              <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4">
                <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 p-6 flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Calendar className="text-amber-600" size={26} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Start Date</p>
                    <p className="font-black text-lg text-slate-800">{project.start_date ? format(parseISO(project.start_date), 'MMMM do, yyyy') : 'TBD'}</p>
                  </div>
                </div>

                <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 p-6 flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
                    <MapPin className="text-blue-600" size={26} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Location</p>
                    <p className="font-black text-lg text-slate-800">{project.city || 'Local Area'}</p>
                  </div>
                </div>
              </div>

              {/* Timeline Graphic */}
              <div className="md:col-span-3 bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 p-8 lg:p-10 animate-in slide-in-from-bottom-4">
                <h3 className="text-xl font-bold text-slate-900 mb-8">Project Timeline</h3>
                <div className="relative pl-6">
                  <div className="absolute left-8 top-4 bottom-4 w-1 bg-slate-100 rounded-full"></div>
                  <TimelineItem status={getStepStatus('New')} title="Project Created" desc="We have received your project details." />
                  <TimelineItem status={getStepStatus('Scheduled')} title="Scheduled" desc="Your project dates are locked in." />
                  <TimelineItem status={getStepStatus('In Progress')} title="Construction Underway" desc="Our crew is currently working on-site." />
                  <TimelineItem status={getStepStatus('Completed')} title="Project Completed" desc="All work finished." isLast />
                </div>
              </div>

              {/* Messaging Widget */}
              <div className="md:col-span-3 bg-white/80 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/60 p-8 lg:p-10 relative overflow-hidden animate-in slide-in-from-bottom-4">
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
                    <button onClick={() => setFeedbackSent(false)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-2xl transition-all">Send Another</button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
                    <textarea 
                      className="w-full p-5 bg-white/50 backdrop-blur-md border border-slate-200/80 rounded-3xl focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none min-h-[140px] text-slate-800 placeholder-slate-400 resize-none shadow-inner"
                      placeholder="e.g. Could we make sure the walkway curves around the big oak tree?" 
                      value={message} 
                      onChange={e => setMessage(e.target.value)} 
                    />
                    {file && (
                      <div className="bg-slate-100/50 p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
                         <div className="flex items-center gap-3"><ImageIcon size={18} className="text-blue-500"/><span className="text-sm font-bold text-slate-700 truncate">{file.name}</span></div>
                         <button type="button" onClick={() => { setFile(null); if(fileInputRef.current) fileInputRef.current.value = ''; }} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 bg-slate-100/80 hover:bg-slate-200 px-6 py-4 rounded-2xl text-slate-700 font-bold transition-all"><ImageIcon size={20} className="text-slate-500" />Attach Photo</button>
                      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={e => setFile(e.target.files[0])} />
                      <button type="submit" disabled={isSubmitting || (!message && !file)} className="w-full sm:w-auto flex-[2] bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-8 rounded-2xl flex justify-center items-center gap-2 transition-all disabled:opacity-50">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send size={20} /> Send Message</>}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </div>

        {/* --- COMPANY CONTACT FOOTER --- */}
        <div className="text-center space-y-6 pt-10 pb-6">
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Questions about your estimate? Contact us anytime.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="mailto:Adam@pavingstone.pro" className="flex items-center gap-3 text-slate-700 hover:text-amber-600 transition-colors font-bold bg-white/60 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/60 shadow-sm hover:shadow-md">
              <Mail size={18} className="text-slate-400" /> Adam@pavingstone.pro
            </a>
            <a href="tel:2048036464" className="flex items-center gap-3 text-slate-700 hover:text-amber-600 transition-colors font-bold bg-white/60 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/60 shadow-sm hover:shadow-md">
              <Phone size={18} className="text-slate-400" /> (204) 803-6464
            </a>
          </div>
        </div>

      </div>

      {/* --- CONTRACT MODAL --- */}
      {showContractModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
            
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-black text-slate-900 text-xl">Contract & Terms of Service</h3>
                <p className="text-sm text-slate-500 mt-1">Please review and sign below to approve your project.</p>
              </div>
              <button onClick={() => setShowContractModal(false)} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-800 transition-colors shadow-sm">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-white">
              <div className="prose prose-sm max-w-none text-slate-600 font-medium whitespace-pre-wrap bg-slate-50 p-6 rounded-xl border border-slate-100">
                {CONTRACT_TERMS}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50">
              <label className="block text-sm font-bold text-slate-800 mb-2">9. CUSTOMER AUTHORIZATION</label>
              <p className="text-xs text-slate-500 mb-4">By typing your full name below, you authorize The Paving Stone Pros to commence the agreed-upon project under the Terms & Conditions outlined above.</p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <input 
                  type="text" 
                  placeholder="Type your full legal name to sign..." 
                  className="flex-1 p-4 border-2 border-slate-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-500/20 outline-none font-bold text-slate-900 font-serif"
                  value={signatureName}
                  onChange={e => setSignatureName(e.target.value)}
                />
                <button 
                  onClick={handleApprove}
                  disabled={!signatureName.trim() || isApproving}
                  className="bg-green-600 hover:bg-green-500 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-[0_4px_14px_rgba(22,163,74,0.3)] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                >
                  {isApproving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                  Sign & Approve
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}

function TimelineItem({ status, title, desc, isLast }) {
  let Icon = Circle
  let colorClass = "text-slate-300 bg-white border-slate-200"

  if (status === 'completed') { 
    Icon = CheckCircle2
    colorClass = "text-green-500 bg-green-50 border-green-200 shadow-[0_0_15px_rgba(34,197,94,0.2)]"
  } else if (status === 'current') { 
    Icon = Clock
    colorClass = "text-amber-500 bg-amber-50 border-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.4)]"
  }

  return (
    <div className={`relative pl-14 ${!isLast ? 'mb-10' : ''}`}>
      <div className={`absolute left-0 top-0 w-12 h-12 rounded-2xl border flex items-center justify-center z-10 transition-all duration-500 ${colorClass} ${status === 'current' ? 'animate-pulse' : ''}`}>
        <Icon size={24} />
      </div>
      {!isLast && (
        <div className={`absolute left-6 top-12 bottom-[-40px] w-1 rounded-full transition-colors duration-500 -ml-[2px] ${status === 'completed' ? 'bg-green-500/50' : 'bg-slate-200/50'}`}></div>
      )}
      <div className="pt-2">
        <h4 className={`text-lg transition-colors duration-300 ${status === 'current' ? 'font-black text-slate-900' : 'font-bold text-slate-400'}`}>{title}</h4>
        <p className="text-slate-500 mt-1 font-medium">{desc}</p>
      </div>
    </div>
  )
}
