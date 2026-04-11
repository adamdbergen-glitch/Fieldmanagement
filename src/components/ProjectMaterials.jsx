import React, { useState, useRef } from 'react' // NEW: Imported useRef
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Package, Plus, Trash2, Truck, ArrowRight, X, DollarSign, Save, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function ProjectMaterials({ projectId }) {
  const queryClient = useQueryClient()
  const { userProfile } = useAuth()
  
  // Local state for adding new items
  const [newItemName, setNewItemName] = useState('')
  const [newItemQty, setNewItemQty] = useState('')

  // NEW: Ref to focus the input from the empty state button
  const nameInputRef = useRef(null)

  // Local state for Crew inputs
  const [loadInputs, setLoadInputs] = useState({}) 

  // --- NEW: COST MODAL STATE ---
  const [pendingLoad, setPendingLoad] = useState(null) // Holds data while asking for cost
  const [costInput, setCostInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 1. Fetch Materials
  const { data: materials, isLoading } = useQuery({
    queryKey: ['project_materials', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_materials')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at')
      return data
    }
  })

  // ACTION: Manager adds a new material line
  const handleAddMaterial = async (e) => {
    e.preventDefault()
    if (!newItemName || !newItemQty) return

    await supabase.from('project_materials').insert({
      project_id: projectId,
      material_name: newItemName,
      quantity_required: parseFloat(newItemQty),
      quantity_collected: 0
    })

    setNewItemName('')
    setNewItemQty('')
    queryClient.invalidateQueries(['project_materials', projectId])
  }

  // ACTION: Manager deletes a line
  const handleDelete = async (id) => {
    if(!window.confirm("Delete this material line?")) return
    await supabase.from('project_materials').delete().eq('id', id)
    queryClient.invalidateQueries(['project_materials', projectId])
  }

  // ACTION: STEP 1 - Crew clicks "Load" (Opens Modal)
  const initiateLoad = (material, id) => {
    const amountToLoad = parseFloat(loadInputs[id] || 0)
    if (amountToLoad <= 0) return

    // Save the intent to state, but don't save to DB yet
    setPendingLoad({
      material: material,
      id: id,
      amountToAdd: amountToLoad
    })
    setCostInput('') // Reset cost input
  }

  // ACTION: STEP 2 - Confirm in Modal (Updates DB + Adds Expense)
  const confirmLoad = async () => {
    if (!pendingLoad) return
    setIsSubmitting(true)

    try {
      // 1. Update Material Count
      const newCollected = (pendingLoad.material.quantity_collected || 0) + pendingLoad.amountToAdd
      
      const { error: matError } = await supabase
        .from('project_materials')
        .update({ quantity_collected: newCollected })
        .eq('id', pendingLoad.id)
      
      if (matError) throw matError

      // 2. Add Expense (Only if cost was entered)
      if (costInput && parseFloat(costInput) > 0) {
        const { error: expError } = await supabase
          .from('project_expenses')
          .insert({
            project_id: projectId,
            description: `Material Load: ${pendingLoad.material.material_name} (+${pendingLoad.amountToAdd})`,
            amount: parseFloat(costInput),
            purchased_by: userProfile.id
          })
        if (expError) throw expError
      }

      // 3. Cleanup
      setLoadInputs(prev => ({ ...prev, [pendingLoad.id]: '' })) // Clear input row
      setPendingLoad(null) // Close modal
      
      // 4. Refresh Data
      await Promise.all([
        queryClient.invalidateQueries(['project_materials', projectId]),
        queryClient.invalidateQueries(['project_expenses', projectId]), // Update Financial Tab
        queryClient.invalidateQueries(['project', projectId]) // Update Dashboard Profit
      ])

    } catch (err) {
      alert("Error: " + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Helper to handle input changes for specific rows
  const handleInputChange = (id, value) => {
    setLoadInputs(prev => ({ ...prev, [id]: value }))
  }

  if (isLoading) return <div className="p-4 text-center text-slate-400">Loading materials...</div>

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-full flex flex-col relative">
      <div className="flex items-center gap-2 mb-6">
        <Truck className="text-amber-500" size={24} />
        <h3 className="font-bold text-slate-900 text-xl">Material Load List</h3>
      </div>

      {/* LIST OF MATERIALS */}
      <div className="flex-1 space-y-3 mb-6 overflow-y-auto">
        
        {/* NEW: Upgraded Empty State with Call to Action */}
        {materials?.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
            <div className="w-12 h-12 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center mb-4">
              <Package size={24} className="text-slate-400" />
            </div>
            <h4 className="text-sm font-bold text-slate-700 mb-2">No Materials Added</h4>
            <p className="text-xs text-slate-500 max-w-[250px] mb-5 leading-relaxed">
              Start building your load list so the crew knows exactly what to bring to the site.
            </p>
            <button 
              onClick={() => nameInputRef.current?.focus()}
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-amber-600 hover:border-amber-300 text-xs font-bold py-2.5 px-5 rounded-lg transition-all flex items-center gap-2 shadow-sm"
            >
              <Plus size={14} /> Add First Material
            </button>
          </div>
        )}

        {materials?.map(item => {
          const collected = parseFloat(item.quantity_collected)
          const required = parseFloat(item.quantity_required)
          const remaining = parseFloat((required - collected).toFixed(2))
          const isFullyLoaded = remaining <= 0

          return (
            <div 
              key={item.id} 
              className={`p-3 rounded-lg border flex flex-col gap-3 ${
                isFullyLoaded ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              {/* TOP ROW */}
              <div className="flex justify-between items-start">
                <div>
                  <span className={`font-bold block ${isFullyLoaded ? 'text-green-700' : 'text-slate-800'}`}>
                    {item.material_name}
                  </span>
                  <div className="text-xs text-slate-500 mt-1">
                    Req: <span className="font-mono font-bold">{required}</span> | 
                    Loaded: <span className="font-mono font-bold">{collected}</span>
                  </div>
                </div>
                
                <div className="text-right">
                  {isFullyLoaded ? (
                    <span className="bg-green-200 text-green-800 text-xs font-bold px-2 py-1 rounded">COMPLETE</span>
                  ) : (
                    <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded">NEED {remaining}</span>
                  )}
                  <button onClick={() => handleDelete(item.id)} className="block ml-auto mt-2 text-slate-300 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* BOTTOM ROW: "I Got X" Input */}
              {!isFullyLoaded && (
                <div className="flex gap-2 items-center mt-1">
                  <input 
                    type="number" step="any" placeholder="#" 
                    className="w-20 p-2 text-sm border border-slate-300 rounded focus:border-amber-500 outline-none"
                    value={loadInputs[item.id] || ''}
                    onChange={(e) => handleInputChange(item.id, e.target.value)}
                  />
                  <button 
                    onClick={() => initiateLoad(item, item.id)} // <--- Changes here
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-1"
                  >
                    Load <ArrowRight size={12} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* MANAGER ADD FORM */}
      <div className="pt-4 border-t border-slate-100">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Add New Material</h4>
        <form onSubmit={handleAddMaterial} className="flex gap-2">
          <input 
            type="text" 
            placeholder="Item (e.g. Gravel)" 
            className="flex-1 p-2 text-sm border border-slate-300 rounded focus:border-amber-500 outline-none" 
            value={newItemName} 
            onChange={(e) => setNewItemName(e.target.value)} 
            ref={nameInputRef} // NEW: Attached the ref here
          />
          <input 
            type="number" 
            step="any" 
            placeholder="Qty" 
            className="w-16 p-2 text-sm border border-slate-300 rounded focus:border-amber-500 outline-none" 
            value={newItemQty} 
            onChange={(e) => setNewItemQty(e.target.value)} 
          />
          <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white p-2 rounded"><Plus size={20} /></button>
        </form>
      </div>

      {/* --- COST MODAL (Overlay) --- */}
      {pendingLoad && (
        <div className="absolute inset-0 z-10 bg-slate-900/95 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-white rounded-lg shadow-2xl overflow-hidden">
            
            {/* Header */}
            <div className="bg-amber-500 p-4 flex justify-between items-center text-white">
              <div>
                <p className="text-xs font-bold uppercase opacity-90">Confirm Load</p>
                <p className="font-bold text-lg">{pendingLoad.amountToAdd} of {pendingLoad.material.material_name}</p>
              </div>
              <button onClick={() => setPendingLoad(null)} className="hover:bg-amber-600 rounded p-1"><X size={20} /></button>
            </div>

            {/* Body */}
            <div className="p-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">Did this specific load cost money?</label>
              
              <div className="relative mb-6">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-slate-400 font-bold">$</span>
                </div>
                <input
                  type="number" step="0.01" autoFocus
                  className="w-full pl-8 pr-4 py-3 text-lg font-bold border-2 border-slate-200 rounded-lg focus:border-amber-500 focus:outline-none"
                  placeholder="0.00"
                  value={costInput}
                  onChange={e => setCostInput(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-2">Leave blank if inventory / free.</p>
              </div>

              <button 
                onClick={confirmLoad}
                disabled={isSubmitting}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-colors"
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                {costInput ? `Save & Add $${costInput}` : 'Save (No Cost)'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
