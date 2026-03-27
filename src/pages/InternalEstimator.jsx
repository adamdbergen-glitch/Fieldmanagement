import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { can } from '../lib/permissions'
import { calculatePavingEstimate } from '../lib/pricing' 
import { Send, Bot, UserPlus, Loader2, RefreshCw, Paperclip, X, Image as ImageIcon, Mic } from 'lucide-react'

export default function InternalEstimator() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)

  const [messages, setMessages] = useState([{ role: 'assistant', content: "Hey Adam! What project are we scoping out today? You can type, or upload a sketch/voice memo." }])
  const [input, setInput] = useState('')
  const [file, setFile] = useState(null)
  const [isTyping, setIsTyping] = useState(false)
  const [extractedMeta, setExtractedMeta] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', address: '' })

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  if (!can(userProfile?.role, ['admin'])) {
    return <div className="p-10 text-center font-bold text-slate-500">Admin Access Only</div>
  }

  const currentEstimate = (extractedMeta && extractedMeta.sqft > 0) 
    ? calculatePavingEstimate({
        ...extractedMeta,
        areas: [{ square_feet: Number(extractedMeta.sqft), is_backyard: !!extractedMeta.isBackyard }]
      }) 
    : null;

  const handleChat = async (e) => {
    e.preventDefault()
    if (!input.trim() && !file) return

    const newMsg = { role: 'user', content: input || "Attached file for analysis." }
    setMessages(prev => [...prev, newMsg])
    setInput('')
    setIsTyping(true)

    try {
      let attachmentPayload = null;

      // 1. If there's a file, upload it to Supabase first
      if (file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `estimator/${Date.now()}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage.from('portal-uploads').upload(fileName, file)
        if (uploadError) throw uploadError
        
        const { data: urlData } = supabase.storage.from('portal-uploads').getPublicUrl(fileName)
        
        // Determine if it's audio or image
        const isAudio = file.type.startsWith('audio') || file.type.startsWith('video') || file.name.match(/\.(m4a|mp3|wav|ogg)$/i);
        
        attachmentPayload = {
          url: urlData.publicUrl,
          type: isAudio ? 'audio' : 'image'
        };
        
        setFile(null);
        if(fileInputRef.current) fileInputRef.current.value = '';
      }

      // 2. Ping the backend
      const res = await fetch('https://pavingstone-chatbot.onrender.com/api/internal-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [...messages, newMsg],
          attachment: attachmentPayload 
        })
      })
      const data = await res.json()
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      
      if (data.meta) setExtractedMeta(data.meta)
      if (data.customer) {
        setCustomerInfo(prev => ({
          name: data.customer.name || prev.name,
          phone: data.customer.phone || prev.phone,
          email: data.customer.email || prev.email,
          address: data.customer.address || prev.address
        }))
      }
    } catch (err) {
      console.error("Chat failed:", err)
      alert("Error processing request: " + err.message);
    } finally {
      setIsTyping(false)
    }
  }

  const handleCreateLead = async () => {
    if (!currentEstimate) return
    if (!customerInfo.name.trim()) return alert("Enter a customer name.")
    setIsSaving(true)
    
    try {
      const { data: newCust, error: cErr } = await supabase.from('customers').insert(customerInfo).select().single()
      if (cErr) throw cErr

      const scopeText = `Auto-extracted via AI Chat:
Size: ${extractedMeta.sqft} sqft
Type: ${extractedMeta.project_type}
Material: ${extractedMeta.material_code}

--- Project Summary ---
${extractedMeta.scope_summary || "No summary provided."}`

      const { data: proj, error: pErr } = await supabase.from('projects').insert({
        name: `Lead: ${extractedMeta.sqft} sqft ${extractedMeta.project_type}`,
        customer_id: newCust.id,
        estimate: currentEstimate.exact_price,
        status: 'New', // Standardized to "New" for consistency
        scope_of_work: scopeText
      }).select().single()

      if (pErr) throw pErr
      navigate(`/projects/${proj.id}`)
    } catch (err) {
      alert("Error saving: " + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-140px)]">
      {/* CHAT PANEL */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden relative">
        <div className="p-4 bg-slate-50 border-b font-bold flex items-center gap-2">
          <Bot size={20} className="text-amber-500"/> Scoping Assistant
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`p-3 rounded-2xl max-w-[85%] ${m.role === 'user' ? 'bg-amber-500 font-medium' : 'bg-white border'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {isTyping && (
             <div className="flex justify-start">
               <div className="p-3 rounded-2xl bg-slate-100 flex gap-2">
                 <Loader2 size={16} className="animate-spin text-slate-500" />
                 <span className="text-sm text-slate-500 font-medium">Analyzing...</span>
               </div>
             </div>
          )}
          <div ref={scrollRef} />
        </div>

        <div className="p-4 border-t bg-white">
          {file && (
             <div className="flex items-center gap-2 mb-2 bg-slate-50 p-2 rounded-lg border border-slate-200 w-fit">
                {file.type.includes('audio') || file.name.match(/\.(m4a|mp3|wav|ogg)$/i) ? <Mic size={14} className="text-blue-500"/> : <ImageIcon size={14} className="text-blue-500"/>}
                <span className="text-xs text-slate-600 truncate max-w-[200px]">{file.name}</span>
                <button onClick={() => { setFile(null); if(fileInputRef.current) fileInputRef.current.value = ''; }} className="text-slate-400 hover:text-red-500">
                  <X size={14} />
                </button>
             </div>
          )}
          <form onSubmit={handleChat} className="flex gap-2 items-end">
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200"
              title="Upload Audio or Sketch"
            >
              <Paperclip size={20} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept="image/*,audio/*,video/mp4" // iPhones sometimes save voice memos as video/mp4 format
              onChange={(e) => {
                if (e.target.files?.[0]) setFile(e.target.files[0])
              }}
            />
            <input 
              className="flex-1 p-3 bg-slate-100 rounded-xl outline-none h-[48px]" 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              placeholder="Describe project or upload a file..." 
              disabled={isTyping}
            />
            <button disabled={isTyping || (!input.trim() && !file)} className="p-3 bg-slate-900 text-white rounded-xl disabled:opacity-50 h-[48px]">
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>

      {/* SIDEBAR */}
      <div className="w-80 bg-slate-900 rounded-2xl p-6 text-white flex flex-col">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Lead Variables</h2>
        {currentEstimate ? (
          <div className="space-y-6 flex-1 flex flex-col">
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
              <p className="text-[10px] text-amber-500 font-bold uppercase">Internal Price</p>
              <p className="text-3xl font-black text-amber-400">${currentEstimate.exact_price?.toLocaleString()}</p>
            </div>
            {/* Customer Inputs */}
            <div className="space-y-2">
              <input placeholder="Name *" className="w-full p-2 bg-slate-800 rounded border-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} />
              <input placeholder="Phone" className="w-full p-2 bg-slate-800 rounded border-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} />
              <input placeholder="Email" className="w-full p-2 bg-slate-800 rounded border-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={customerInfo.email} onChange={e => setCustomerInfo({...customerInfo, email: e.target.value})} />
              <input placeholder="Address" className="w-full p-2 bg-slate-800 rounded border-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={customerInfo.address} onChange={e => setCustomerInfo({...customerInfo, address: e.target.value})} />
            </div>
            <button onClick={handleCreateLead} disabled={isSaving} className="w-full py-4 bg-white hover:bg-slate-200 text-slate-900 font-black rounded-xl mt-auto transition-colors">
              {isSaving ? <Loader2 className="animate-spin mx-auto" /> : <span className="flex items-center justify-center gap-2"><UserPlus size={20} /> Create Lead</span>}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-20"><RefreshCw size={40} /></div>
        )}
      </div>
    </div>
  )
}
