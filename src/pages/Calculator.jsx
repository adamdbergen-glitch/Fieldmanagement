import React, { useState, useEffect } from 'react'
import { Calculator as CalcIcon, Truck, Info, AlertTriangle, ArrowDownToLine, Maximize } from 'lucide-react'

// WINNIPEG LANDSCAPE MATERIALS DATA
const MATERIALS = [
  { 
    id: 'base', 
    name: '3/4" Down Limestone (Base)', 
    density: 1.35, 
    compaction: 0.20, 
    unit: 'Yards',
    desc: 'Driveway/Patio Base. Compacts significantly.'
  },
  { 
    id: 'clear', 
    name: '3/4" Clean Limestone', 
    density: 1.25, 
    compaction: 0.03, 
    unit: 'Yards',
    desc: 'Drainage, window wells. Minimal compaction.'
  },
  { 
    id: 'quarter_down', 
    name: '1/4" Down Limestone (Bedding)', 
    density: 1.35, 
    compaction: 0.15, 
    unit: 'Yards',
    desc: 'Superior paver bedding. Packs tight, deters ants.'
  },
  { 
    id: 'granite', 
    name: 'Black Granite (Decorative)', 
    density: 1.4, 
    compaction: 0.05, 
    unit: 'Yards',
    desc: 'Decorative stone (Kenora style).'
  },
  { 
    id: 'river', 
    name: 'River Wash / Stone', 
    density: 1.5, 
    compaction: 0.02, 
    unit: 'Yards',
    desc: 'Heavy round stone. Does not pack.'
  },
  { 
    id: 'soil', 
    name: '4-Way Mix / Topsoil', 
    density: 1.1, 
    compaction: 0.15, 
    unit: 'Yards',
    desc: 'Gardens, sod base. Will settle.'
  },
  { 
    id: 'mulch', 
    name: 'Bark Mulch', 
    density: 0.4, 
    compaction: 0.0, 
    unit: 'Yards',
    desc: 'Lightweight. Sold by volume.'
  }
]

export default function Calculator() {
  // Inputs
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [manualArea, setManualArea] = useState('') // The master "Area" input
  
  const [depth, setDepth] = useState(4)
  const [waste, setWaste] = useState(10)
  const [material, setMaterial] = useState(MATERIALS[0])

  // --- LOGIC: AUTO-CALCULATE AREA ---
  // If user types Length/Width, update Area automatically.
  useEffect(() => {
    const l = parseFloat(length)
    const w = parseFloat(width)
    if (!isNaN(l) && !isNaN(w)) {
      setManualArea((l * w).toFixed(0))
    }
  }, [length, width])

  // --- THE MATH ---
  const d = parseFloat(depth) || 0
  const finalAreaSqFt = parseFloat(manualArea) || 0

  // 1. Target Volume
  const targetVolumeCuFt = finalAreaSqFt * (d / 12)
  const targetVolumeCuYards = targetVolumeCuFt / 27
  
  // 2. Compaction Factor (Target / (1 - Rate))
  const compactedVolumeYards = targetVolumeCuYards / (1 - material.compaction)

  // 3. Apply Waste
  const wasteMultiplier = 1 + (waste / 100)
  const requiredYards = compactedVolumeYards * wasteMultiplier
  
  // 4. Estimate Weight
  const estimatedTons = requiredYards * material.density

  const compactionAdded = requiredYards - (targetVolumeCuYards * wasteMultiplier)

  return (
    <div className="max-w-xl mx-auto p-6 pb-24">
      
      {/* HEADER */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center text-slate-900 shadow-lg shadow-amber-500/20">
          <CalcIcon size={24} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 leading-none">Material Calc</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Winnipeg Supply Rates</p>
        </div>
      </div>

      <div className="space-y-6">
        
        {/* 1. MATERIAL */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">1. Select Material</label>
          <select 
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 text-lg focus:ring-2 focus:ring-amber-500 outline-none"
            value={material.id}
            onChange={(e) => setMaterial(MATERIALS.find(m => m.id === e.target.value))}
          >
            {MATERIALS.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <Info size={12} /> {material.desc} (Compaction: {(material.compaction * 100).toFixed(0)}%)
          </p>
        </div>

        {/* 2. AREA INPUTS */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">2. Calculate Area</label>
          
          {/* Option A: Dimensions */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <span className="block text-xs font-bold text-slate-500 mb-1">Length (ft)</span>
              <input 
                type="number" inputMode="decimal"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xl focus:ring-2 focus:ring-amber-500 outline-none"
                placeholder="0"
                value={length}
                onChange={e => setLength(e.target.value)}
              />
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-500 mb-1">Width (ft)</span>
              <input 
                type="number" inputMode="decimal"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-xl focus:ring-2 focus:ring-amber-500 outline-none"
                placeholder="0"
                value={width}
                onChange={e => setWidth(e.target.value)}
              />
            </div>
          </div>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-4 text-xs font-bold text-slate-300 uppercase">OR Manual Area</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Option B: Direct Area Override */}
          <div className="mt-2">
             <span className="block text-xs font-bold text-amber-600 mb-1 flex items-center gap-1"><Maximize size={12}/> Total Area (sq ft) - <span className="text-slate-400 font-normal">Use for odd shapes</span></span>
             <input 
                type="number" inputMode="decimal"
                className="w-full p-3 bg-amber-50 border border-amber-200 text-slate-900 rounded-lg font-black text-3xl focus:ring-2 focus:ring-amber-500 outline-none"
                placeholder="0"
                value={manualArea}
                onChange={e => {
                  setManualArea(e.target.value)
                  // If user types here, we clear L/W to indicate manual mode
                  if(length || width) { setLength(''); setWidth(''); }
                }}
              />
          </div>
        </div>

        {/* 3. DEPTH & WASTE */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">3. Depth & Waste</label>
          <div className="grid grid-cols-2 gap-4">
             <div>
              <span className="block text-xs font-bold text-slate-500 mb-1">Finished Depth (in)</span>
              <input 
                type="number" inputMode="decimal"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-2xl focus:ring-2 focus:ring-amber-500 outline-none"
                value={depth}
                onChange={e => setDepth(e.target.value)}
              />
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-500 mb-1">Safety / Waste %</span>
              <div className="flex items-center gap-2">
                 <button onClick={() => setWaste(5)} className={`flex-1 py-3 rounded-lg font-bold text-sm border transition-colors ${waste === 5 ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>5%</button>
                 <button onClick={() => setWaste(10)} className={`flex-1 py-3 rounded-lg font-bold text-sm border transition-colors ${waste === 10 ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>10%</button>
                 <button onClick={() => setWaste(15)} className={`flex-1 py-3 rounded-lg font-bold text-sm border transition-colors ${waste === 15 ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>15%</button>
              </div>
            </div>
          </div>
        </div>

        {/* 4. RESULTS CARD */}
        <div className="bg-slate-900 rounded-xl p-6 text-white shadow-xl">
           <div className="flex justify-between items-start mb-6">
             <div>
               <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Order Amount</p>
               <h2 className="text-5xl font-black text-amber-400 mt-1">
                 {requiredYards.toFixed(2)} <span className="text-lg text-amber-200/50 font-bold ml-1">yds³</span>
               </h2>
             </div>
             <div className="text-right">
                <p className="text-slate-500 text-xs font-bold uppercase">Total Area</p>
                <p className="font-mono font-bold text-lg">{finalAreaSqFt.toFixed(0)} ft²</p>
             </div>
           </div>

           {/* COMPACTION DETAILS */}
           {material.compaction > 0 && (
             <div className="bg-slate-800 rounded-lg p-3 mb-3 flex items-center justify-between border border-slate-700">
               <div className="flex items-center gap-2">
                 <ArrowDownToLine size={16} className="text-amber-500" />
                 <span className="text-sm font-bold text-slate-300">Compaction Factor</span>
               </div>
               <div className="text-right">
                 <span className="block text-xs text-slate-500">Adds approx.</span>
                 <span className="font-bold text-amber-500">+{compactionAdded.toFixed(2)} yds³</span>
               </div>
             </div>
           )}

           {/* WEIGHT WARNING */}
           <div className="bg-slate-800/50 rounded-lg p-3 flex items-start gap-3 border border-slate-700">
             <Truck className="text-slate-400 shrink-0 mt-0.5" size={20} />
             <div>
               <p className="text-slate-300 text-sm font-bold">Est. Weight: <span className="text-white">{estimatedTons.toFixed(1)} Tons</span></p>
               <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                 Density: {material.density} tons/yd³.
               </p>
               {estimatedTons > 4 && (
                 <div className="mt-2 flex items-center gap-2 text-amber-500 text-xs font-bold">
                   <AlertTriangle size={14} /> Heavy Load - Tandem Axle Required
                 </div>
               )}
             </div>
           </div>
        </div>

        <div className="text-center">
          <button 
            onClick={() => { setLength(''); setWidth(''); setManualArea(''); }} 
            className="text-slate-400 font-bold text-sm hover:text-slate-600 flex items-center justify-center gap-2 mx-auto"
          >
             Reset Calculation
          </button>
        </div>

      </div>
    </div>
  )
}