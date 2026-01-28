import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { 
  Calculator as CalcIcon, Truck, Info, AlertTriangle, 
  ArrowDownToLine, Maximize, Save, X, Loader2, 
  Grid, Layers, Box, Square, ArrowRight, Activity
} from 'lucide-react'

// --- DATA: BULK MATERIALS ---
const BULK_MATERIALS = [
  { id: 'base', name: '3/4" Down Limestone (Base)', density: 1.35, compaction: 0.20, unit: 'Yards', desc: 'Driveway/Patio Base. Compacts significantly.' },
  { id: 'clear', name: '3/4" Clean Limestone', density: 1.25, compaction: 0.03, unit: 'Yards', desc: 'Drainage, window wells. Minimal compaction.' },
  { id: 'quarter_down', name: '1/4" Down Limestone (Bedding)', density: 1.35, compaction: 0.15, unit: 'Yards', desc: 'Superior paver bedding. Packs tight, deters ants.' },
  { id: 'granite', name: 'Black Granite (Decorative)', density: 1.4, compaction: 0.05, unit: 'Yards', desc: 'Decorative stone (Kenora style).' },
  { id: 'river', name: 'River Wash / Stone', density: 1.5, compaction: 0.02, unit: 'Yards', desc: 'Heavy round stone. Does not pack.' },
  { id: 'soil', name: '4-Way Mix / Topsoil', density: 1.1, compaction: 0.15, unit: 'Yards', desc: 'Gardens, sod base. Will settle.' },
  { id: 'mulch', name: 'Bark Mulch', density: 0.4, compaction: 0.0, unit: 'Yards', desc: 'Lightweight. Sold by volume.' }
]

// --- DATA: PAVERS (WINNIPEG SPECS) ---
const PAVER_BRANDS = {
  barkman: {
    name: 'Barkman',
    products: [
      { id: 'roman', name: 'Roman Paver (Combo)', sqft_pallet: 96, sqft_layer: 10.6, desc: 'Classic 3-size tumbled system.' },
      { id: 'broadway_65', name: 'Broadway 65mm', sqft_pallet: 115, sqft_layer: 11.5, desc: 'Large format modern slab.' },
      { id: 'navarro', name: 'Navarro', sqft_pallet: 90, sqft_layer: 10, desc: 'Textured 3-size system.' }
    ]
  },
  belgard: {
    name: 'Belgard',
    products: [
      { id: 'holland', name: 'Holland Stone (4x8)', sqft_pallet: 120, sqft_layer: 12, desc: 'Standard 4x8 brick. Best for patterns.' },
      { id: 'dim_12', name: 'Dimensions 12', sqft_pallet: 96, sqft_layer: 12, desc: 'Smooth modern slab.' }
    ]
  },
  borders: {
    name: 'Borders / Accents',
    products: [
      { id: 'holland_border', name: 'Holland (4x8)', sqft_pallet: 120, sqft_layer: 12, width_soldier: 8, width_sailor: 4, desc: 'The universal border stone.' },
      { id: '6x9_border', name: '6x9 Accent', sqft_pallet: 95, sqft_layer: 11, width_soldier: 9, width_sailor: 6, desc: 'Thicker, bolder border.' }
    ]
  }
}

export default function Calculator() {
  const [mode, setMode] = useState('bulk') // 'bulk' or 'paver'
  
  // Inputs
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [manualArea, setManualArea] = useState('') 
  const [perimeter, setPerimeter] = useState('') // Linear Feet (Manual or Auto)
  
  const [depth, setDepth] = useState(4)
  const [waste, setWaste] = useState(10)
  
  // Selections
  const [bulkMaterial, setBulkMaterial] = useState(BULK_MATERIALS[0])
  const [paverBrand, setPaverBrand] = useState('barkman')
  const [paverProduct, setPaverProduct] = useState(PAVER_BRANDS.barkman.products[0])

  // --- BORDER STATE ---
  const [addBorder, setAddBorder] = useState(false)
  const [borderProduct, setBorderProduct] = useState(PAVER_BRANDS.borders.products[0])
  const [borderOrientation, setBorderOrientation] = useState('soldier') // 'soldier' or 'sailor'

  // Save Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // --- AUTO-CALC DIMENSIONS ---
  useEffect(() => {
    const l = parseFloat(length)
    const w = parseFloat(width)
    // Only auto-calc if BOTH L and W are valid numbers
    if (!isNaN(l) && !isNaN(w) && l > 0 && w > 0) {
      setManualArea((l * w).toFixed(0))
      setPerimeter(((l + w) * 2).toFixed(0))
    }
  }, [length, width])

  // --- CALCULATION LOGIC ---
  const grossAreaSqFt = parseFloat(manualArea) || 0
  const wasteMultiplier = 1 + (waste / 100)

  // 1. Border Math
  let borderAreaSqFt = 0
  let borderPallets = 0
  
  if (mode === 'paver' && addBorder) {
    const linearFeet = parseFloat(perimeter) || 0
    // Get width in feet (e.g., 8 inches = 0.66 ft)
    const widthInches = borderOrientation === 'soldier' ? borderProduct.width_soldier : borderProduct.width_sailor
    borderAreaSqFt = linearFeet * (widthInches / 12)
    
    // Add waste to border
    borderPallets = (borderAreaSqFt * 1.05) / borderProduct.sqft_pallet 
  }

  // 2. Net Main Area (Gross - Border)
  const netMainAreaSqFt = Math.max(0, grossAreaSqFt - borderAreaSqFt)

  // 3. Bulk Results
  let bulkYards = 0
  let bulkTons = 0
  let compactionAdd = 0
  
  if (mode === 'bulk') {
    const volumeCuFt = grossAreaSqFt * (d => d / 12)(parseFloat(depth) || 0)
    const volumeCuYards = volumeCuFt / 27
    const compactedYards = volumeCuYards / (1 - bulkMaterial.compaction)
    bulkYards = compactedYards * wasteMultiplier
    compactionAdd = bulkYards - (volumeCuYards * wasteMultiplier)
    bulkTons = bulkYards * bulkMaterial.density
  }

  // 4. Paver Results
  let paverTotalSqFt = 0
  let paverPallets = 0
  
  if (mode === 'paver') {
    paverTotalSqFt = netMainAreaSqFt * wasteMultiplier
    paverPallets = paverTotalSqFt / paverProduct.sqft_pallet
  }

  // --- FETCH PROJECTS ---
  const { data: projects } = useQuery({
    queryKey: ['active_projects_list'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, customer:customers(name)').neq('status', 'Completed').order('name')
      return data || []
    },
    enabled: isModalOpen
  })

  // --- SAVE TO PROJECT ---
  const handleSaveToProject = async (projectId) => {
    if (!projectId) return
    setIsSaving(true)

    try {
      const itemsToSave = []

      // 1. Main Material
      if (mode === 'bulk') {
        itemsToSave.push({
          project_id: projectId,
          material_name: bulkMaterial.name,
          quantity_required: parseFloat(bulkYards.toFixed(2)),
          quantity_collected: 0
        })
      } else {
        // Main Paver
        itemsToSave.push({
          project_id: projectId,
          material_name: `${paverProduct.name} (${paverPallets.toFixed(2)} plts)`,
          quantity_required: parseFloat(paverTotalSqFt.toFixed(2)),
          quantity_collected: 0
        })
        
        // Border Paver (If Active)
        if (addBorder && borderPallets > 0) {
           itemsToSave.push({
            project_id: projectId,
            material_name: `BORDER: ${borderProduct.name} (${borderPallets.toFixed(2)} plts)`,
            quantity_required: parseFloat((borderAreaSqFt * 1.05).toFixed(2)),
            quantity_collected: 0
          })
        }
      }

      const { error } = await supabase.from('project_materials').insert(itemsToSave)

      if (error) throw error
      setIsModalOpen(false)
      alert(`Saved ${itemsToSave.length} items to project!`)
      
    } catch (err) {
      alert('Error saving: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4 md:p-6 pb-24 relative">
      
      {/* HEADER & MODE SWITCH */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center text-slate-900 shadow-lg shadow-amber-500/20">
            <CalcIcon size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 leading-none">Estimator</h1>
            <p className="text-slate-500 text-sm font-medium mt-1">Winnipeg Supply Rates</p>
          </div>
        </div>

        {/* TABS */}
        <div className="bg-slate-100 p-1 rounded-lg flex font-bold text-sm">
          <button 
            onClick={() => setMode('bulk')}
            className={`flex-1 py-2 rounded-md transition-all flex items-center justify-center gap-2 ${mode === 'bulk' ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Truck size={16} /> Gravel / Soil
          </button>
          <button 
            onClick={() => setMode('paver')}
            className={`flex-1 py-2 rounded-md transition-all flex items-center justify-center gap-2 ${mode === 'paver' ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Grid size={16} /> Pavers
          </button>
        </div>
      </div>

      <div className="space-y-6">
        
        {/* 1. SELECTION CARD */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">1. Material Selection</label>
          
          {mode === 'bulk' ? (
            // BULK SELECTOR
            <>
              <select 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 text-lg focus:ring-2 focus:ring-amber-500 outline-none"
                value={bulkMaterial.id}
                onChange={(e) => setBulkMaterial(BULK_MATERIALS.find(m => m.id === e.target.value))}
              >
                {BULK_MATERIALS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                <Info size={12} /> {bulkMaterial.desc}
              </p>
            </>
          ) : (
            // PAVER SELECTOR
            <div className="space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {Object.keys(PAVER_BRANDS).filter(k => k !== 'borders').map(brandKey => (
                  <button
                    key={brandKey}
                    onClick={() => {
                      setPaverBrand(brandKey)
                      setPaverProduct(PAVER_BRANDS[brandKey].products[0])
                    }}
                    className={`flex-1 py-2 px-3 text-xs font-bold rounded border whitespace-nowrap ${paverBrand === brandKey ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}
                  >
                    {PAVER_BRANDS[brandKey].name}
                  </button>
                ))}
              </div>
              <select 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 text-lg focus:ring-2 focus:ring-amber-500 outline-none"
                value={paverProduct.id}
                onChange={(e) => setPaverProduct(PAVER_BRANDS[paverBrand].products.find(p => p.id === e.target.value))}
              >
                {PAVER_BRANDS[paverBrand].products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <Layers size={12} /> {paverProduct.sqft_pallet} sqft/pallet • {paverProduct.sqft_layer} sqft/layer
              </p>
            </div>
          )}
        </div>

        {/* 2. DIMENSIONS CARD */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">2. Dimensions</label>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <span className="block text-xs font-bold text-slate-500 mb-1">Length (ft)</span>
              <input type="number" inputMode="decimal" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xl outline-none focus:ring-2 focus:ring-amber-500" placeholder="0" value={length} onChange={e => setLength(e.target.value)} />
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-500 mb-1">Width (ft)</span>
              <input type="number" inputMode="decimal" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xl outline-none focus:ring-2 focus:ring-amber-500" placeholder="0" value={width} onChange={e => setWidth(e.target.value)} />
            </div>
          </div>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-4 text-xs font-bold text-slate-300 uppercase">OR Manual Entry (Irregular)</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* MANUAL ENTRY GRID (UPDATED) */}
          <div className="grid grid-cols-2 gap-4 mt-2 mb-4">
             <div>
                <span className="block text-xs font-bold text-amber-600 mb-1 flex items-center gap-1">
                  <Maximize size={12}/> Total Area (sq ft)
                </span>
                <input 
                  type="number" inputMode="decimal" 
                  className="w-full p-3 bg-amber-50 border border-amber-200 text-slate-900 rounded-lg font-black text-2xl outline-none focus:ring-2 focus:ring-amber-500" 
                  placeholder="0" value={manualArea} 
                  onChange={e => { 
                    setManualArea(e.target.value); 
                    if(length || width) { setLength(''); setWidth(''); }
                  }} 
                />
             </div>
             
             {/* MANUAL PERIMETER INPUT (Visible for Pavers) */}
             {mode === 'paver' && (
                <div>
                  <span className="block text-xs font-bold text-blue-600 mb-1 flex items-center gap-1">
                    <Activity size={12}/> Perimeter (lin ft)
                  </span>
                  <input 
                    type="number" inputMode="decimal" 
                    className="w-full p-3 bg-blue-50 border border-blue-200 text-slate-900 rounded-lg font-black text-2xl outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="0" value={perimeter} 
                    onChange={e => {
                      setPerimeter(e.target.value);
                      if(length || width) { setLength(''); setWidth(''); }
                    }} 
                  />
               </div>
             )}
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
             {/* Only show Depth for Bulk */}
             {mode === 'bulk' ? (
               <div>
                <span className="block text-xs font-bold text-slate-500 mb-1">Depth (in)</span>
                <input type="number" inputMode="decimal" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xl outline-none focus:ring-2 focus:ring-amber-500" value={depth} onChange={e => setDepth(e.target.value)} />
              </div>
             ) : (
                <div className="col-span-2">
                    <label className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-slate-50">
                        <span className="font-bold text-slate-700 flex items-center gap-2"><Square size={16} className={addBorder ? 'text-blue-500' : 'text-slate-400'}/> Add Border?</span>
                        <input type="checkbox" checked={addBorder} onChange={e => setAddBorder(e.target.checked)} className="w-5 h-5 accent-blue-600" />
                    </label>
                </div>
             )}
             
             {/* Waste Selection */}
             <div className={mode === 'paver' && !addBorder ? 'col-span-2' : ''}>
              <span className="block text-xs font-bold text-slate-500 mb-1">Waste %</span>
              <div className="flex items-center gap-2">
                 {[5, 10, 15].map(val => (
                   <button key={val} onClick={() => setWaste(val)} className={`flex-1 py-2 rounded-lg font-bold text-sm border ${waste === val ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>{val}%</button>
                 ))}
              </div>
            </div>
          </div>

          {/* BORDER SETTINGS (Conditional) */}
          {addBorder && mode === 'paver' && (
              <div className="mt-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <p className="text-xs font-bold text-blue-700 uppercase mb-2">Border Settings</p>
                      
                      <div className="grid grid-cols-1 gap-3 mb-3">
                         <div>
                            <span className="text-[10px] font-bold text-blue-400 uppercase">Select Stone</span>
                            <select className="w-full p-2 rounded border border-blue-200 font-bold text-sm" value={borderProduct.id} onChange={e => setBorderProduct(PAVER_BRANDS.borders.products.find(p => p.id === e.target.value))}>
                                {PAVER_BRANDS.borders.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                      </div>

                      <div className="flex gap-2">
                          <button onClick={() => setBorderOrientation('soldier')} className={`flex-1 py-2 text-xs font-bold rounded border ${borderOrientation === 'soldier' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-400 border-blue-200'}`}>Soldier ({borderProduct.width_soldier}")</button>
                          <button onClick={() => setBorderOrientation('sailor')} className={`flex-1 py-2 text-xs font-bold rounded border ${borderOrientation === 'sailor' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-400 border-blue-200'}`}>Sailor ({borderProduct.width_sailor}")</button>
                      </div>
                  </div>
              </div>
          )}
        </div>

        {/* 3. RESULTS CARD */}
        <div className="bg-slate-900 rounded-xl p-6 text-white shadow-xl relative overflow-hidden">
           
           {/* BULK RESULTS */}
           {mode === 'bulk' && (
             <>
               <div className="flex justify-between items-start mb-6">
                 <div>
                   <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Order Amount</p>
                   <h2 className="text-5xl font-black text-amber-400 mt-1">{bulkYards.toFixed(2)} <span className="text-lg text-amber-200/50 font-bold ml-1">yds³</span></h2>
                 </div>
                 <div className="text-right">
                    <p className="text-slate-500 text-xs font-bold uppercase">Coverage</p>
                    <p className="font-mono font-bold text-lg">{grossAreaSqFt.toFixed(0)} ft²</p>
                 </div>
               </div>
               
               {/* Bulk Metadata */}
               <div className="space-y-3">
                  {bulkMaterial.compaction > 0 && (
                    <div className="bg-slate-800 rounded-lg p-3 flex items-center justify-between border border-slate-700">
                      <div className="flex items-center gap-2"><ArrowDownToLine size={16} className="text-amber-500" /><span className="text-sm font-bold text-slate-300">Compaction</span></div>
                      <span className="font-bold text-amber-500">+{compactionAdd.toFixed(2)} yds³</span>
                    </div>
                  )}
                  <div className="bg-slate-800/50 rounded-lg p-3 flex items-start gap-3 border border-slate-700">
                    <Truck className="text-slate-400 shrink-0 mt-0.5" size={20} />
                    <div>
                      <p className="text-slate-300 text-sm font-bold">Est. Weight: <span className="text-white">{bulkTons.toFixed(1)} Tons</span></p>
                      {bulkTons > 4 && <div className="mt-1 flex items-center gap-2 text-amber-500 text-xs font-bold"><AlertTriangle size={14} /> Heavy Load</div>}
                    </div>
                  </div>
               </div>
             </>
           )}

           {/* PAVER RESULTS */}
           {mode === 'paver' && (
             <>
               <div className="flex justify-between items-start mb-6">
                 <div>
                   <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Main Field</p>
                   <h2 className="text-5xl font-black text-amber-400 mt-1">{paverPallets.toFixed(2)} <span className="text-lg text-amber-200/50 font-bold ml-1">Pallets</span></h2>
                   <p className="text-xs text-slate-400 mt-1">{paverTotalSqFt.toFixed(0)} sqft needed (Net)</p>
                 </div>
                 <div className="text-right">
                    <p className="text-slate-500 text-xs font-bold uppercase">Total Area</p>
                    <p className="font-mono font-bold text-lg">{grossAreaSqFt.toFixed(0)} ft²</p>
                 </div>
               </div>

               {/* Paver Metadata */}
               <div className="space-y-3">
                   {/* Main Pallet Breakdown */}
                   <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 flex justify-between items-center">
                        <span className="text-slate-300 text-xs font-bold uppercase">Full Pallets</span>
                        <div className="text-right">
                             <span className="text-white font-mono font-bold text-lg mr-3">{Math.floor(paverPallets)}</span>
                             <span className="text-amber-400 font-mono font-bold text-lg">
                                +{Math.ceil((paverPallets - Math.floor(paverPallets)) * (paverProduct.sqft_pallet / paverProduct.sqft_layer))} Layers
                             </span>
                        </div>
                   </div>

                   {/* Border Result */}
                   {addBorder && borderPallets > 0 && (
                       <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3 flex justify-between items-center">
                           <div>
                               <p className="text-blue-200 text-xs font-bold uppercase">Border: {borderProduct.name}</p>
                               <p className="text-white font-bold text-lg mt-1">{borderPallets.toFixed(2)} Pallets</p>
                           </div>
                           <div className="text-right">
                               <p className="text-blue-300 text-xs">{perimeter} lin. ft</p>
                               <p className="text-blue-300 text-xs">{borderAreaSqFt.toFixed(0)} sqft</p>
                           </div>
                       </div>
                   )}
               </div>
             </>
           )}

           {/* SAVE BUTTON */}
           <button 
             onClick={() => setIsModalOpen(true)}
             disabled={grossAreaSqFt <= 0}
             className="w-full mt-6 bg-white text-slate-900 font-bold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
           >
             <Save size={20} /> Save to Project
           </button>
        </div>

        <div className="text-center">
          <button onClick={() => { setLength(''); setWidth(''); setManualArea(''); setPerimeter(''); }} className="text-slate-400 font-bold text-sm hover:text-slate-600">
             Reset Calculation
          </button>
        </div>
      </div>

      {/* --- SAVE MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Save size={18} className="text-amber-500" /> Save to Project</h3>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-slate-600" size={24} /></button>
            </div>
            
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
              <div className="mb-4 bg-blue-50 border border-blue-100 p-3 rounded-lg space-y-2">
                <p className="text-xs text-blue-700 font-bold uppercase mb-1">Items to Add</p>
                {mode === 'bulk' ? (
                  <p className="text-lg font-black text-blue-900">{bulkYards.toFixed(2)} yds³ <span className="font-normal text-sm text-blue-600">of {bulkMaterial.name}</span></p>
                ) : (
                  <>
                     <p className="text-lg font-black text-blue-900">{paverPallets.toFixed(2)} Plts <span className="font-normal text-sm text-blue-600">of {paverProduct.name}</span></p>
                     {addBorder && <p className="text-lg font-black text-blue-900">{borderPallets.toFixed(2)} Plts <span className="font-normal text-sm text-blue-600">of {borderProduct.name}</span></p>}
                  </>
                )}
              </div>

              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select Active Project</p>
              {projects?.length === 0 && <p className="text-center text-slate-500 py-4 italic">No active projects.</p>}
              {projects?.map(proj => (
                <button
                  key={proj.id}
                  onClick={() => handleSaveToProject(proj.id)}
                  disabled={isSaving}
                  className="w-full text-left p-4 rounded-lg border border-slate-200 hover:border-amber-500 hover:bg-amber-50 transition-all group relative"
                >
                  <p className="font-bold text-slate-800 group-hover:text-slate-900">{proj.customer?.name || 'Unnamed Client'}</p>
                  <p className="text-xs text-slate-500">{proj.name}</p>
                  {isSaving && <div className="absolute right-4 top-4"><Loader2 className="animate-spin text-amber-500" size={16} /></div>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}