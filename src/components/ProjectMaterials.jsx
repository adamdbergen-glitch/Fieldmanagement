import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Package, Plus, Trash2, Truck, ArrowRight } from 'lucide-react'

export default function ProjectMaterials({ projectId }) {
  const queryClient = useQueryClient()
  
  // Local state for the "Manager" adding new items
  const [newItemName, setNewItemName] = useState('')
  const [newItemQty, setNewItemQty] = useState('')

  // Local state for "Crew" inputting load amounts (keyed by material ID)
  const [loadInputs, setLoadInputs] = useState({}) 

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
      quantity_required: parseFloat(newItemQty), // <--- CHANGED to Float
      quantity_collected: 0
    })

    setNewItemName('')
    setNewItemQty('')
    queryClient.invalidateQueries(['project_materials', projectId])
  }

  // ACTION: Manager deletes a line
  const handleDelete = async (id) => {
    await supabase.from('project_materials').delete().eq('id', id)
    queryClient.invalidateQueries(['project_materials', projectId])
  }

  // ACTION: Crew updates the count ("I got 2.5")
  const handleLoad = async (material, id) => {
    const amountToLoad = parseFloat(loadInputs[id] || 0) // <--- CHANGED to Float
    if (amountToLoad <= 0) return

    const newCollected = (material.quantity_collected || 0) + amountToLoad

    await supabase
      .from('project_materials')
      .update({ quantity_collected: newCollected })
      .eq('id', id)

    // Clear the input box for that row
    setLoadInputs(prev => ({ ...prev, [id]: '' }))
    queryClient.invalidateQueries(['project_materials', projectId])
  }

  // Helper to handle input changes for specific rows
  const handleInputChange = (id, value) => {
    setLoadInputs(prev => ({ ...prev, [id]: value }))
  }

  if (isLoading) return <div className="p-4 text-center text-slate-400">Loading materials...</div>

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-6">
        <Truck className="text-amber-500" size={24} />
        <h3 className="font-bold text-slate-900 text-xl">Material Load List</h3>
      </div>

      {/* LIST OF MATERIALS */}
      <div className="flex-1 space-y-3 mb-6 overflow-y-auto">
        {materials?.length === 0 && (
          <p className="text-slate-400 italic text-sm text-center py-4 border-2 border-dashed border-slate-100 rounded-lg">
            List is empty. Add materials below.
          </p>
        )}

        {materials?.map(item => {
          // Calculate remaining and fix float precision issues for display
          const collected = parseFloat(item.quantity_collected)
          const required = parseFloat(item.quantity_required)
          const remaining = parseFloat((required - collected).toFixed(2)) // Fix JS math weirdness
          const isFullyLoaded = remaining <= 0

          return (
            <div 
              key={item.id} 
              className={`p-3 rounded-lg border flex flex-col gap-3 ${
                isFullyLoaded ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              {/* TOP ROW: Name and Status */}
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
                
                {/* REMAINING BADGE */}
                <div className="text-right">
                  {isFullyLoaded ? (
                    <span className="bg-green-200 text-green-800 text-xs font-bold px-2 py-1 rounded">
                      COMPLETE
                    </span>
                  ) : (
                    <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded">
                      NEED {remaining}
                    </span>
                  )}
                  {/* Delete Button (Small x) */}
                  <button 
                    onClick={() => handleDelete(item.id)}
                    className="block ml-auto mt-2 text-slate-300 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* BOTTOM ROW: "I Got X" Input (Only show if not complete) */}
              {!isFullyLoaded && (
                <div className="flex gap-2 items-center mt-1">
                  <input 
                    type="number" 
                    step="any" // <--- ALLOWS DECIMALS
                    placeholder="#" 
                    className="w-20 p-2 text-sm border border-slate-300 rounded focus:border-amber-500 outline-none"
                    value={loadInputs[item.id] || ''}
                    onChange={(e) => handleInputChange(item.id, e.target.value)}
                  />
                  <button 
                    onClick={() => handleLoad(item, item.id)}
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
          />
          <input 
            type="number" 
            step="any" // <--- ALLOWS DECIMALS
            placeholder="Qty" 
            className="w-16 p-2 text-sm border border-slate-300 rounded focus:border-amber-500 outline-none"
            value={newItemQty}
            onChange={(e) => setNewItemQty(e.target.value)}
          />
          <button 
            type="submit"
            className="bg-amber-500 hover:bg-amber-600 text-white p-2 rounded"
          >
            <Plus size={20} />
          </button>
        </form>
      </div>
    </div>
  )
}