import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Book, Search, Plus, X, Trash2, ChevronRight, ListChecks, Edit } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { can, PERMISSIONS } from '../lib/permissions'

export default function SOPs() {
  const navigate = useNavigate() // <--- Added for navigation
  const { userProfile } = useAuth()
  const [sops, setSops] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Modal State (For viewing the manual)
  const [selectedSop, setSelectedSop] = useState(null)
  const [checklistItems, setChecklistItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)

  // 1. Fetch the Library on Load
  useEffect(() => {
    fetchSOPs()
  }, [])

  async function fetchSOPs() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('sops')
        .select('*')
        .order('category', { ascending: true })
        .order('title', { ascending: true })
      
      if (error) throw error
      setSops(data || [])
    } catch (error) {
      console.error('Error fetching SOPs:', error.message)
    } finally {
      setLoading(false)
    }
  }

  // 2. Fetch Steps when a Card is Clicked
  async function handleViewSop(sop) {
    setSelectedSop(sop)
    setLoadingItems(true)
    try {
      const { data, error } = await supabase
        .from('sop_items')
        .select('*')
        .eq('sop_id', sop.id)
        .order('sort_order', { ascending: true })
        
      if (error) throw error
      setChecklistItems(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingItems(false)
    }
  }

  // 3. Delete Action (Admins Only)
  async function handleDelete(id, e) {
    e.stopPropagation() // Stop the card from opening
    if (!window.confirm('Are you sure you want to delete this SOP? This cannot be undone.')) return
    
    const { error } = await supabase.from('sops').delete().eq('id', id)
    if (error) alert(error.message)
    else {
      setSops(sops.filter(s => s.id !== id))
      if (selectedSop?.id === id) setSelectedSop(null)
    }
  }

  // Filter Logic
  const filteredSops = sops.filter(s => 
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.category && s.category.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8 h-[calc(100vh-80px)] flex flex-col">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">SOP Library</h1>
          <p className="text-slate-500 mt-1">Operational Field Manuals</p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          {/* SEARCH BAR */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search guides..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* CREATE BUTTON (New!) */}
          <button 
            onClick={() => navigate('/sops/new')}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 shadow-sm transition-all"
          >
            <Plus size={20} /> <span className="hidden md:inline">Create SOP</span>
          </button>
        </div>
      </div>

      {/* SOP GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-10 pr-2">
        {loading ? (
          <div className="col-span-3 text-center py-20 text-slate-400">Loading library...</div>
        ) : filteredSops.length === 0 ? (
          <div className="col-span-3 text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
            <Book size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">No guides found.</p>
            <button onClick={() => navigate('/sops/new')} className="text-amber-600 font-bold text-sm mt-2 hover:underline">Create your first SOP</button>
          </div>
        ) : (
          filteredSops.map((sop) => (
            <div 
              key={sop.id} 
              onClick={() => handleViewSop(sop)}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-400 transition-all cursor-pointer group flex flex-col h-full"
            >
              {/* Category Tag */}
              <div className="mb-4">
                <span className="bg-slate-100 text-slate-500 text-xs font-bold px-2 py-1 rounded uppercase tracking-wide group-hover:bg-amber-100 group-hover:text-amber-700 transition-colors">
                  {sop.category || 'General'}
                </span>
              </div>

              {/* Title & Desc */}
              <div className="flex-1">
                <h3 className="font-bold text-lg text-slate-900 mb-2 leading-tight group-hover:text-amber-600 transition-colors">
                  {sop.title}
                </h3>
                <p className="text-slate-500 text-sm line-clamp-3 leading-relaxed">
                  {sop.description || 'View detailed steps...'}
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-50 text-sm text-slate-400">
                <span className="flex items-center gap-1 group-hover:text-slate-600 font-medium">
                  Read Manual <ChevronRight size={16} />
                </span>
                
                {/* Admin Actions */}
                <div className="flex gap-1">
                  {/* EDIT BUTTON (New!) */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/sops/${sop.id}`)
                    }}
                    className="text-slate-300 hover:text-blue-500 p-2 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Edit size={16} />
                  </button>

                  {/* DELETE BUTTON */}
                  {can(userProfile?.role, PERMISSIONS.CAN_DELETE_PROJECT) && (
                    <button 
                      onClick={(e) => handleDelete(sop.id, e)}
                      className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* READING MODAL (The Reference Manual View) */}
      {selectedSop && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
              <div>
                <span className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1 block">
                  {selectedSop.category}
                </span>
                <h2 className="text-2xl font-bold text-slate-900">{selectedSop.title}</h2>
              </div>
              <button 
                onClick={() => setSelectedSop(null)}
                className="bg-white p-2 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-all shadow-sm"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content (Scrollable List) */}
            <div className="p-8 overflow-y-auto flex-1">
              {loadingItems ? (
                <div className="text-center py-10 text-slate-400">Loading steps...</div>
              ) : (
                <div className="space-y-4">
                  {checklistItems.map((item) => (
                    <div key={item.id}>
                      {item.is_header ? (
                        // HEADER ROW (PHASES)
                        <div className="mt-8 mb-3 pb-2 border-b border-slate-200 first:mt-0">
                           <h4 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                             <ListChecks size={20} className="text-amber-500" />
                             {item.item_text}
                           </h4>
                        </div>
                      ) : (
                        // STANDARD ITEM ROW
                        <div className="flex gap-4 items-start py-1 pl-2">
                          <div className="shrink-0 mt-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                          </div>
                          <p className="text-slate-600 text-base leading-relaxed">
                            {item.item_text}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {checklistItems.length === 0 && (
                    <p className="text-center text-slate-400 italic py-10">
                      No detailed steps found for this SOP.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setSelectedSop(null)}
                className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors shadow-lg"
              >
                Close Manual
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}