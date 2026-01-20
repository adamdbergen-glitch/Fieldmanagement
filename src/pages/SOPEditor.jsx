import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { 
  ArrowLeft, Save, Plus, Trash2, GripVertical, Type, CheckSquare, Loader2
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function SOPEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  
  // Basic Info
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  
  // The List Items
  const [items, setItems] = useState([
    { id: Date.now(), text: '', is_header: false }
  ])

  // --- SECURITY CHECK ---
  useEffect(() => {
    // If profile is loaded and NOT admin, kick them out
    if (userProfile && userProfile.role !== 'admin') {
      navigate('/sops')
    }
  }, [userProfile, navigate])

  // Fetch data if editing
  useEffect(() => {
    if (id) {
      fetchSOP()
    }
  }, [id])

  const fetchSOP = async () => {
    setLoading(true)
    const { data: sop } = await supabase.from('sops').select('*').eq('id', id).single()
    if (sop) {
      setTitle(sop.title)
      setCategory(sop.category)
    }
    const { data: sopItems } = await supabase.from('sop_items').select('*').eq('sop_id', id).order('sort_order')
    if (sopItems) {
      setItems(sopItems.map(i => ({ id: i.id, text: i.item_text, is_header: i.is_header })))
    }
    setLoading(false)
  }

  // --- ACTIONS ---

  const addItem = (isHeader) => {
    setItems([...items, { id: Date.now(), text: '', is_header: isHeader }])
  }

  const updateItem = (index, val) => {
    const newItems = [...items]
    newItems[index].text = val
    setItems(newItems)
  }

  const removeItem = (index) => {
    const newItems = items.filter((_, i) => i !== index)
    setItems(newItems)
  }

  const handleSave = async () => {
    if (!title.trim()) return alert("Please enter a Title")
    
    // Double-check permission before saving
    if (userProfile?.role !== 'admin') return alert("Unauthorized")

    setLoading(true)

    try {
      let sopId = id

      // 1. Upsert SOP Parent
      const { data: sopData, error: sopError } = await supabase
        .from('sops')
        .upsert({ 
          id: id,
          title, 
          category 
        })
        .select()
        .single()
      
      if (sopError) throw sopError
      sopId = sopData.id

      // 2. Delete old items (simplest way to handle re-ordering)
      if (id) {
        await supabase.from('sop_items').delete().eq('sop_id', sopId)
      }

      // 3. Insert new items
      const itemsToInsert = items.map((item, index) => ({
        sop_id: sopId,
        item_text: item.text,
        is_header: item.is_header,
        sort_order: index
      }))

      // Filter out empty lines
      const validItems = itemsToInsert.filter(i => i.item_text.trim() !== '')

      if (validItems.length > 0) {
        const { error: itemsError } = await supabase.from('sop_items').insert(validItems)
        if (itemsError) throw itemsError
      }

      navigate('/sops')

    } catch (err) {
      alert("Error saving: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  // If unauthorized, show nothing while redirecting
  if (userProfile?.role !== 'admin') return null

  if (loading && id && !title) return <div className="p-8 text-center"><Loader2 className="animate-spin inline text-amber-500"/></div>

  return (
    <div className="max-w-3xl mx-auto p-6 pb-20">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/sops')} className="text-slate-500 hover:text-slate-800 flex items-center gap-2">
          <ArrowLeft size={20} /> Back
        </button>
        <button 
          onClick={handleSave}
          disabled={loading}
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
          Save SOP
        </button>
      </div>

      {/* TITLE CARD */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">SOP Title</label>
        <input 
          autoFocus
          className="text-2xl font-bold w-full border-b border-slate-200 pb-2 focus:outline-none focus:border-amber-500 placeholder-slate-300"
          placeholder="e.g. Daily Truck Inspection"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        
        <div className="mt-4">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Category</label>
          <input 
            className="w-full text-sm p-2 bg-slate-50 rounded border border-slate-200 focus:outline-none focus:border-amber-500"
            placeholder="e.g. Safety, Maintenance, Installation"
            value={category}
            onChange={e => setCategory(e.target.value)}
          />
        </div>
      </div>

      {/* BUILDER AREA */}
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id} className="group flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="text-slate-300 cursor-move"><GripVertical size={20} /></div>

            <div className={`flex-1 flex items-center bg-white border transition-colors rounded-lg overflow-hidden ${
              item.is_header ? 'border-slate-300 bg-slate-50' : 'border-slate-200 hover:border-amber-300'
            }`}>
              
              <div className={`w-10 h-10 flex items-center justify-center shrink-0 ${
                item.is_header ? 'text-slate-600 font-bold' : 'text-slate-400'
              }`}>
                {item.is_header ? <Type size={18} /> : <CheckSquare size={18} />}
              </div>

              <input 
                className={`flex-1 p-3 bg-transparent focus:outline-none ${
                  item.is_header ? 'font-bold text-slate-800' : 'text-slate-600'
                }`}
                placeholder={item.is_header ? "Section Header (e.g. 'Preparation')" : "Action item..."}
                value={item.text}
                onChange={(e) => updateItem(index, e.target.value)}
                onKeyDown={(e) => {
                  if(e.key === 'Enter') addItem(false)
                }}
              />
            </div>

            <button 
              onClick={() => removeItem(index)}
              className="text-slate-300 hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>

      {/* ADD BUTTONS */}
      <div className="flex gap-4 mt-6">
        <button 
          onClick={() => addItem(false)}
          className="flex-1 py-3 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl hover:border-amber-500 hover:text-amber-600 hover:bg-amber-50 transition-all font-bold flex items-center justify-center gap-2"
        >
          <Plus size={20} /> Add Checkbox
        </button>
        <button 
          onClick={() => addItem(true)}
          className="px-6 py-3 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl hover:border-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all font-bold flex items-center justify-center gap-2"
        >
          <Type size={20} /> Add Section Header
        </button>
      </div>

    </div>
  )
}