import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { can } from '../lib/permissions'
import { calculatePavingEstimate, calculateRelevelEstimate } from '../lib/pricing' 
import { Send, Bot, UserPlus, Loader2, RefreshCw, Calculator, Edit2, Check, X } from 'lucide-react'

export default function InternalEstimator() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const scrollRef = useRef(null)

  const [messages, setMessages] = useState([{ role: 'assistant', content: "Hey Adam! What project are we scoping out today?" }])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  // New Stateful Variables for Multi-Item Quotes
  const [lineItems, setLineItems] = useState([])
  const [extractedMeta, setExtractedMeta] = useState(null)
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '', address: '' })

  // Editing State for Line Items on Mobile
  const [editingIndex, setEditingIndex] = useState(null)
  const [editForm, setEditForm] = useState({})

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  if (!can(userProfile?.role, ['admin'])) {
    return <div className="p-10 text-center font-bold text-slate-500">Admin Access Only</div>
  }

  // Live Math Calculation for MULTIPLE Line Items
  const getCalculatedTotals = () => {
    let grandTotal = 0;
    const itemsWithPrices = lineItems.map(item => {
      let price = 0;
      if (item.sqft > 0) {
        if (item.project_type === 'relevel') {
          const est = calculateRelevelEstimate({
            areas: [{ square_feet: Number(item.sqft) }],
            needsEdging: !!item.needs_edging,
            isPoorCondition: !!item.is_poor_condition,
            isOutOfTown: extractedMeta?.is_out_of_town || false
          });
          price = est ? est.exact_price : 0;
        } else {
          const est = calculatePavingEstimate({
            project_type: item.project_type || 'patio',
            access_level: extractedMeta?.access_level || 'medium',
            material_code: item.material_code || 'barkman_holland',
            city_town: extractedMeta?.city_town || 'Winnipeg',
            is_out_of_town: extractedMeta?.is_out_of_town || false,
            areas: [{ square_feet: Number(item.sqft), is_backyard: !!item.is_backyard }]
          });
          price = est ? est.exact_price : 0;
        }
      }
      grandTotal += price;
      return { ...item, calculatedPrice: price };
    });
    return { items: itemsWithPrices, total: grandTotal };
  };

  const { items: pricedLineItems, total: targetInternalPrice } = getCalculatedTotals();

  const handleChat = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const newMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, newMsg])
    setInput('')
    setIsTyping(true)

    try {
      // Pass the messages AND the current running state to the server
      const res = await fetch('https://pavingstone-chatbot.onrender.com/api/internal-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [...messages, newMsg],
          currentState: { line_items: lineItems, meta: extractedMeta, customer: customerInfo }
        })
      })
      const data = await res.json()
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      
      if (data.line_items) setLineItems(data.line_items)
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
    } finally {
      setIsTyping(false)
    }
  }

  // Editing Handlers
  const startEditing = (index, item) => {
    setEditingIndex(index);
    setEditForm({ ...item });
  }

  const saveEdit = () => {
    const updatedItems = [...lineItems];
    updatedItems[editingIndex] = { ...editForm, sqft: Number(editForm.sqft) || 0 };
    setLineItems(updatedItems);
    setEditingIndex(null);
  }

  const handleCreateLead = async () => {
    if (lineItems.length === 0) return alert("You need at least one project area to create a lead.")
    if (!customerInfo.name.trim()) return alert("Enter a customer name.")
    setIsSaving(true)
    
    try {
      const { data: newCust, error: cErr } = await supabase.from('customers').insert({
        name: customerInfo.name,
        email: customerInfo.email,
        phone: customerInfo.phone,
        address: customerInfo.address
      }).select().single()
      
      if (cErr) throw cErr

      const scopeText = `Auto-extracted via AI Chat:

Line Items:
${lineItems.map(i => `- ${i.title || i.project_type}: ${i.sqft} sqft (${i.material_code || 'Standard'})`).join('\n')}

--- Project Summary ---
${extractedMeta?.scope_summary || "No summary provided."}`

      const mainProjectName = lineItems[0]?.project_type || 'Project';
      const mainSqft = lineItems.reduce((sum, item) => sum + (Number(item.sqft) || 0), 0);

      const { data: proj, error: pErr } = await supabase.from('projects').insert({
        name: `Lead: ${mainSqft} sqft ${mainProjectName}`,
        customer_id: newCust.id,
        estimate: targetInternalPrice,
        status: 'Lead',
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
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-50 border-b font-bold flex items-center gap-2 text-slate-800">
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
          {isTyping && <div className="text-slate-400 text-xs animate-pulse italic">Thinking...</div>}
          <div ref={scrollRef} />
        </div>
        <form onSubmit={handleChat} className="p-4 border-t flex gap-2">
          <input className="flex-1 p-3 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-amber-500" value={input} onChange={e => setInput(e.target.value)} placeholder="e.g. 400 sqft patio and 100 sqft relevel..." />
          <button disabled={isTyping} className="p-3 bg-slate-900 text-white rounded-xl disabled:opacity-50 hover:bg-slate-800 transition-colors"><Send size={20} /></button>
        </form>
      </div>

      {/* SIDEBAR */}
      <div className="w-full md:w-96 bg-slate-900 rounded-2xl p-6 text-white flex flex-col shadow-xl overflow-y-auto">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Calculator size={14}/> Lead Variables
        </h2>
        
        {lineItems.length > 0 ? (
          <div className="space-y-6 flex-1 flex flex-col">
            
            {/* Grand Total */}
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
              <p className="text-[10px] text-amber-500 font-bold uppercase mb-1">Target Internal Price</p>
              <p className="text-3xl font-black text-amber-400">${targetInternalPrice.toLocaleString()}</p>
            </div>

            {/* Line Items List */}
            <div className="space-y-3">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest border-b border-slate-700 pb-1">Project Areas</p>
              
              {pricedLineItems.map((item, index) => (
                <div key={index} className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  {editingIndex === index ? (
                    // EDIT MODE
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input className="flex-1 p-2 bg-slate-900 border border-slate-600 rounded text-sm text-white" placeholder="Type (patio, relevel)" value={editForm.project_type || ''} onChange={e => setEditForm({...editForm, project_type: e.target.value})} />
                        <input type="number" className="w-24 p-2 bg-slate-900 border border-slate-600 rounded text-sm text-white" placeholder="Sqft" value={editForm.sqft || ''} onChange={e => setEditForm({...editForm, sqft: e.target.value})} />
                      </div>
                      <input className="w-full p-2 bg-slate-900 border border-slate-600 rounded text-sm text-white" placeholder="Material Code" value={editForm.material_code || ''} onChange={e => setEditForm({...editForm, material_code: e.target.value})} />
                      <div className="flex justify-end gap-2 pt-2">
                        <button onClick={() => setEditingIndex(null)} className="p-2 bg-slate-700 rounded hover:bg-slate-600"><X size={16}/></button>
                        <button onClick={saveEdit} className="p-2 bg-green-600 rounded hover:bg-green-500"><Check size={16}/></button>
                      </div>
                    </div>
                  ) : (
                    // VIEW MODE
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <p className="font-bold text-sm text-amber-400 truncate">{item.title || item.project_type}</p>
                          <p className="text-xs text-slate-400">{item.sqft} sqft • {item.material_code || 'Standard'}</p>
                        </div>
                        {/* Mobile Optimized Edit Button */}
                        <button onClick={() => startEditing(index, item)} className="text-slate-300 bg-slate-700 hover:bg-slate-600 hover:text-white p-2 rounded flex-shrink-0 ml-2 shadow-sm">
                          <Edit2 size={16}/>
                        </button>
                      </div>
                      <p className="text-sm font-mono text-slate-300 text-right font-bold">${item.calculatedPrice.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Customer Inputs */}
            <div className="space-y-2 mt-auto pt-4 border-t border-slate-800">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-2">Client Details</p>
              <input placeholder="Name *" className="w-full p-3 bg-slate-800 rounded border border-slate-700 text-sm text-white focus:border-amber-500 focus:outline-none" value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} />
              <input placeholder="Phone" className="w-full p-3 bg-slate-800 rounded border border-slate-700 text-sm text-white focus:border-amber-500 focus:outline-none" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} />
              <input placeholder="Email" className="w-full p-3 bg-slate-800 rounded border border-slate-700 text-sm text-white focus:border-amber-500 focus:outline-none" value={customerInfo.email} onChange={e => setCustomerInfo({...customerInfo, email: e.target.value})} />
            </div>

            <button onClick={handleCreateLead} disabled={isSaving} className="w-full py-4 bg-white text-slate-900 font-black rounded-xl hover:bg-slate-200 transition-colors mt-4 shadow-lg flex items-center justify-center gap-2">
              {isSaving ? <Loader2 className="animate-spin" /> : <UserPlus size={20} />} 
              Create Lead File
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-20">
            <RefreshCw size={40} className="mb-4" />
            <p className="text-xs text-center uppercase tracking-widest font-bold">Waiting for project details...</p>
          </div>
        )}
      </div>
    </div>
  )
}
