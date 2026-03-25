import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { can } from '../lib/permissions'
import { calculatePavingEstimate } from '../lib/pricing' // Uses the local, updated math
import { Send, Bot, UserPlus, Loader2, RefreshCw, Calculator } from 'lucide-react'

export default function InternalEstimator() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const scrollRef = useRef(null)
  const [extractedMeta, setExtractedMeta] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', address: '' })
  const [messages, setMessages] = useState([{ role: 'assistant', content: "Hey Adam! What project are we scoping out today?" }])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [extractedMeta, setExtractedMeta] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Auto-scroll the chat
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Admin Check
  if (!can(userProfile?.role, ['admin'])) {
    return <div className="p-10 text-center font-bold text-slate-500">Admin Access Only</div>
  }

// Live Math Calculation (Runs locally on the frontend)
  const currentEstimate = (extractedMeta && extractedMeta.sqft > 0) 
    ? calculatePavingEstimate({
        project_type: extractedMeta.project_type || 'patio',
        access_level: extractedMeta.access_level || 'medium',
        material_code: extractedMeta.material_code || 'barkman_holland',
        city_town: extractedMeta.city_town || 'Winnipeg',
        is_out_of_town: extractedMeta.is_out_of_town || false,
        areas: [{ 
          // Forcing Number() guarantees it won't fail if the AI passed a string
          square_feet: Number(extractedMeta.sqft) || 0, 
          is_backyard: !!extractedMeta.isBackyard 
        }]
      }) 
    : null;

const handleChat = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const newMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, newMsg])
    setInput('')
    setIsTyping(true)

    try {
      // UPDATE THIS LINE BELOW: Add /api/internal-chat to the URL
      const res = await fetch('https://pavingstone-chatbot.onrender.com/api/internal-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, newMsg] })
      })
      const data = await res.json()
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      
      // Update sidebar state
      if (data.meta) {
        setExtractedMeta(data.meta)
      }
    } catch (err) {
      console.error("Chat failed:", err)
    } finally {
      setIsTyping(false)
    }
  }

const handleCreateLead = async () => {
    if (!currentEstimate) return
    if (!customerInfo.name.trim()) {
      alert("Please enter a customer name before saving the lead.")
      return
    }
    
    setIsSaving(true)
    
    try {
      // 1. Create the Customer Profile first
      const { data: newCustomer, error: custError } = await supabase
        .from('customers')
        .insert({
          name: customerInfo.name,
          email: customerInfo.email,
          phone: customerInfo.phone,
          address: customerInfo.address
        })
        .select()
        .single()

      if (custError) throw custError

      // 2. Format the Notes / Scope of Work
      const scopeText = `Auto-extracted via AI Chat:
Size: ${extractedMeta.sqft} sqft
Type: ${extractedMeta.project_type}
Material: ${extractedMeta.material_code}
Access: ${extractedMeta.access_level}

--- Chat Transcript ---
${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}`

      // 3. Create the Project Lead and link the Customer ID
      const { data: proj, error: projError } = await supabase
        .from('projects')
        .insert({
          name: `Lead: ${extractedMeta.sqft} sqft ${extractedMeta.project_type}`,
          customer_id: newCustomer.id, // Linked to the newly created customer
          estimate: currentEstimate.exact_price,
          status: 'Lead',
          scope_of_work: scopeText
        })
        .select()
        .single()

      if (projError) throw projError
      
      // Navigate to the newly created project file
      navigate(`/projects/${proj.id}`)
      
    } catch (err) {
      alert("Error saving lead: " + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-140px)]">
      {/* LEFT: CHAT PANEL */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-50 border-b flex items-center gap-2 font-bold text-slate-800">
          <Bot size={20} className="text-amber-500"/> Scoping Assistant
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`p-3 rounded-2xl max-w-[85%] ${m.role === 'user' ? 'bg-amber-500 text-slate-900 font-medium rounded-tr-none' : 'bg-white border text-slate-700 rounded-tl-none'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {isTyping && <div className="text-slate-400 text-xs animate-pulse italic">Extracting details...</div>}
          <div ref={scrollRef} />
        </div>

        <form onSubmit={handleChat} className="p-4 border-t flex gap-2">
          <input 
            className="flex-1 p-3 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 transition-all" 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder="e.g. 400 sqft backyard patio with Barkman Fjord" 
          />
          <button disabled={isTyping} className="p-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50">
            <Send size={20} />
          </button>
        </form>
      </div>

      {/* RIGHT: REVIEW SIDEBAR */}
      <div className="w-full md:w-80 bg-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
          <Calculator size={14} /> Lead Variables
        </h2>
        
        {currentEstimate ? (
          <div className="space-y-6 flex-1">
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
              <p className="text-[10px] text-amber-500 font-bold uppercase mb-1">Target Internal Price</p>
              <p className="text-3xl font-black text-amber-400">${currentEstimate.exact_price?.toLocaleString()}</p>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold uppercase">Size</span>
                <span className="font-bold">{extractedMeta.sqft} sqft</span>
              </div>
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex flex-col gap-1">
                <span className="text-xs text-slate-400 font-bold uppercase">Material</span>
                <span className="font-bold text-sm truncate">{extractedMeta.material_code}</span>
              </div>
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold uppercase">Access</span>
                <span className="font-bold capitalize">{extractedMeta.access_level}</span>
              </div>
            </div>

            <div className="pt-4 mt-auto">
              <button 
                onClick={handleCreateLead} 
                disabled={isSaving} 
                className="w-full py-4 bg-white text-slate-900 font-black rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
              >
                {isSaving ? <Loader2 className="animate-spin" /> : <UserPlus size={20} />} 
                Create Lead File
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-20 text-center">
            <RefreshCw size={40} className="mb-4" />
            <p className="text-xs font-bold uppercase tracking-wider">Start chatting<br/>to generate price</p>
          </div>
        )}
      </div>
    </div>
  )
}
