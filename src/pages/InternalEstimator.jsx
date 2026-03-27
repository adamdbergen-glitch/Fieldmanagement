import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { can } from '../lib/permissions'
import { calculatePavingEstimate } from '../lib/pricing' 
import { Send, Bot, UserPlus, Loader2, RefreshCw, Paperclip, X, Image as ImageIcon, Mic, ListPlus } from 'lucide-react'

export default function InternalEstimator() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)

  const [messages, setMessages] = useState([{ role: 'assistant', content: "Hey Adam! What project are we scoping out today? You can type, or upload a sketch/voice memo." }])
  const [input, setInput] = useState('')
  const [file, setFile] = useState(null)
  const [isTyping, setIsTyping] = useState(false)
  
  const [extractedLineItems, setExtractedLineItems] = useState([])
  const [extractedMeta, setExtractedMeta] = useState(null)
  
  const [isSaving, setIsSaving] = useState(false)
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', address: '' })

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  if (!can(userProfile?.role, ['admin'])) {
    return <div className="p-10 text-center font-bold text-slate-500">Admin Access Only</div>
  }

  const evaluatedItems = extractedLineItems.map(item => {
    if (item.sqft > 0) {
      const est = calculatePavingEstimate({
          project_type: item.project_type,
          areas: [{ square_feet: Number(item.sqft), is_backyard: !!item.is_backyard }],
          access_level: extractedMeta?.access_level || "medium",
          material_code: item.material_code
      })
      return { ...item, price: est.exact_price }
    }
    return { ...item, price: 0 }
  })

  // GST Calculation Variables
  const grandTotalSub = evaluatedItems.reduce((sum, i) => sum + i.price, 0)
  const grandTotalGST = grandTotalSub * 0.05
  const grandTotalWithTax = grandTotalSub + grandTotalGST

  const handleChat = async (e) => {
    e.preventDefault()
    if (!input.trim() && !file) return

    const newMsg = { role: 'user', content: input || "Attached file for analysis." }
    setMessages(prev => [...prev, newMsg])
    setInput('')
    setIsTyping(true)

    try {
      let attachmentPayload = null;

      if (file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `estimator/${Date.now()}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage.from('portal-uploads').upload(fileName, file)
        if (uploadError) throw uploadError
        
        const { data: urlData } = supabase.storage.from('portal-uploads').getPublicUrl(fileName)
        
        const isAudio = file.type.startsWith('audio') || file.type.startsWith('video') || file.name.match(/\.(m4a|mp3|wav|ogg)$/i);
        
        attachmentPayload = {
          url: urlData.publicUrl,
          type: isAudio ? 'audio' : 'image'
        };
        
        setFile(null);
        if(fileInputRef.current) fileInputRef.current.value = '';
      }

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
      
      if (data.line_items) setExtractedLineItems(data.line_items)
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
    if (evaluatedItems.length === 0) return alert("No items to quote!")
    if (!customerInfo.name.trim()) return alert("Enter a customer name.")
    setIsSaving(true)
    
    try {
      const { data: newCust, error: cErr } = await supabase.from('customers').insert(customerInfo).select().single()
      if (cErr) throw cErr

      const scopeText = `Auto-extracted via AI Chat:\n${evaluatedItems.length} options/areas discussed.\n\n--- Project Summary ---\n${extractedMeta?.scope_summary || "No summary provided."}`

      const { data: proj, error: pErr } = await supabase.from('projects').insert({
        name: `Lead: ${customerInfo.name}`,
        customer_id: newCust.id,
        estimate: grandTotalSub, // We save the Subtotal to the DB as standard practice
        status: 'New', 
        scope_of_work: scopeText
      }).select().single()

      if (pErr) throw pErr

      const linesToInsert = evaluatedItems.map(item => ({
        project_id: proj.id,
        title: item.title || `${item.sqft} sqft ${item.project_type}`,
        description: `Size: ${item.sqft} sqft | Material: ${item.material_text || 'Standard'}`,
        price: item.price,
        status: 'pending',
        is_change_order: false
      }))

      const { error: lErr } = await supabase.from('project_line_items').insert(linesToInsert)
      if (lErr) throw lErr

      navigate(`/projects/${proj.id}`)
    } catch (err) {
      alert("Error saving: " + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 md:h-[calc(100vh-140px)]">
      
      {/* CHAT PANEL */}
      <div className="h-[65vh] md:h-auto flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden relative shadow-sm">
        <div className="p-4 bg-slate-50 border-b font-bold flex items-center gap-2 shrink-0">
          <Bot size={20} className="text-amber-500"/> Scoping Assistant
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`p-3 rounded-2xl max-w-[85%] ${m.role === 'user' ? 'bg-amber-500 font-medium' : 'bg-white border whitespace-pre-wrap'}`}>
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

        <div className="p-4 border-t bg-white shrink-0">
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
              className="p-3 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200 shrink-0"
              title="Upload Audio or Sketch"
            >
              <Paperclip size={20} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept="image/*,audio/*,video/mp4" 
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
            <button disabled={isTyping || (!input.trim() && !file)} className="p-3 bg-slate-900 text-white rounded-xl disabled:opacity-50 h-[48px] shrink-0">
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>

      {/* SIDEBAR */}
      <div className="w-full md:w-80 shrink-0 bg-slate-900 rounded-2xl p-6 text-white flex flex-col overflow-y-auto shadow-md mb-8 md:mb-0">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Extracted Quote</h2>
        {evaluatedItems.length > 0 ? (
          <div className="space-y-4 flex-1 flex flex-col">
            
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <h3 className="text-[10px] text-amber-500 font-bold uppercase mb-3 flex items-center gap-1"><ListPlus size={12}/> Line Items Found</h3>
              <div className="space-y-3 mb-4">
                {evaluatedItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-slate-700 pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="font-bold text-sm text-slate-200">{item.title || item.project_type}</p>
                      <p className="text-[10px] text-slate-400">{item.sqft} sqft • {item.material_text || 'Standard'}</p>
                    </div>
                    <div className="text-sm font-mono font-bold text-white">${item.price.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t-2 border-slate-700">
                 <div className="flex justify-between items-center mb-1">
                   <span className="text-xs font-bold text-slate-400 uppercase">Subtotal</span>
                   <span className="text-sm font-black text-white">${grandTotalSub.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                 </div>
                 <div className="flex justify-between items-center mb-2">
                   <span className="text-xs font-bold text-slate-400 uppercase">GST (5%)</span>
                   <span className="text-sm font-black text-white">${grandTotalGST.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                 </div>
                 <div className="flex justify-between items-center pt-2 border-t border-slate-600">
                   <span className="text-xs font-bold text-slate-400 uppercase">Grand Total</span>
                   <span className="text-xl font-black text-amber-400">${grandTotalWithTax.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                 </div>
              </div>
            </div>

            <div className="space-y-2 mt-2">
              <input placeholder="Name *" className="w-full p-2 bg-slate-800 rounded border-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} />
              <input placeholder="Phone" className="w-full p-2 bg-slate-800 rounded border-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} />
              <input placeholder="Email" className="w-full p-2 bg-slate-800 rounded border-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={customerInfo.email} onChange={e => setCustomerInfo({...customerInfo, email: e.target.value})} />
              <input placeholder="Address" className="w-full p-2 bg-slate-800 rounded border-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500" value={customerInfo.address} onChange={e => setCustomerInfo({...customerInfo, address: e.target.value})} />
            </div>

            <button onClick={handleCreateLead} disabled={isSaving} className="w-full py-4 bg-white hover:bg-slate-200 text-slate-900 font-black rounded-xl mt-4 transition-colors shrink-0">
              {isSaving ? <Loader2 className="animate-spin mx-auto" /> : <span className="flex items-center justify-center gap-2"><UserPlus size={20} /> Create Lead & Items</span>}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-20 min-h-[300px]"><RefreshCw size={40} /></div>
        )}
      </div>
    </div>
  )
}
