import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { can, PERMISSIONS } from '../lib/permissions'
import { calculatePavingEstimate } from '../lib/pricing' // Your imported math
import { Calculator, UserPlus, DollarSign, Save, Loader2, ShieldAlert } from 'lucide-react'

export default function InternalEstimator() {
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Customer State (Simplified for rapid Lead entry)
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' })

  // Estimator State
  const [estimateData, setEstimateData] = useState({
    project_type: 'patio',
    sqft: '',
    material_code: 'barkman_holland',
    access_level: 'medium',
    isBackyard: true,
    is_out_of_town: false
  })

  // 1. ADMIN PROTECTION
  if (!can(userProfile?.role, ['admin'])) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <ShieldAlert size={48} className="text-red-400 mb-4" />
        <h2 className="text-xl font-bold">Admin Access Only</h2>
        <p>You do not have permission to view the internal estimator.</p>
      </div>
    )
  }

  // 2. LIVE CALCULATION
  const currentEstimate = estimateData.sqft > 0 
    ? calculatePavingEstimate({
        project_type: estimateData.project_type,
        areas: [{ square_feet: parseFloat(estimateData.sqft), is_backyard: estimateData.isBackyard }],
        access_level: estimateData.access_level,
        material_code: estimateData.material_code,
        city_town: "Winnipeg",
        is_out_of_town: estimateData.is_out_of_town
      })
    : null;

  // 3. SUBMIT / SAVE LEAD TO SUPABASE
  const handleSaveLead = async (e) => {
    e.preventDefault()
    if (!currentEstimate) return alert("Please enter square footage to generate an estimate.")
    setIsSubmitting(true)

    try {
      // Step A: Create Customer
      const { data: createdCust, error: custError } = await supabase
        .from('customers')
        .insert({
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        })
        .select()
        .single()
      
      if (custError) throw custError

      // Step B: Create Project marked as a "Lead"
      const scopeText = `Auto-generated Estimate:\n${currentEstimate.details}\nAccess: ${estimateData.access_level}\nTarget Price: $${currentEstimate.exact_price}`;

      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: `${estimateData.project_type} - ${customer.name}`,
          customer_id: createdCust.id,
          estimate: currentEstimate.exact_price, // Save the exact internal price
          scope_of_work: scopeText,
          status: 'Lead' // Categorizes it perfectly
        })
        .select()
        .single()

      if (projectError) throw projectError

      // Success! Redirect to the newly created project
      navigate(`/projects/${projectData.id}`)

    } catch (error) {
      alert('Error saving lead: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto pb-10 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-amber-500 text-slate-900 rounded-xl shadow-lg"><Calculator size={24} strokeWidth={2.5}/></div>
        <h1 className="text-2xl font-black text-slate-900">Internal Estimator</h1>
      </div>

      <form onSubmit={handleSaveLead} className="space-y-6">
        
        {/* CUSTOMER ENTRY */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <UserPlus size={20} className="text-blue-600" /> New Lead Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input required placeholder="Full Name" className="p-3 border rounded-lg focus:border-amber-500 outline-none" 
              value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
            <input type="tel" placeholder="Phone Number" className="p-3 border rounded-lg focus:border-amber-500 outline-none" 
              value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} />
            <input type="email" placeholder="Email (Optional)" className="md:col-span-2 p-3 border rounded-lg focus:border-amber-500 outline-none" 
              value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })} />
          </div>
        </div>

        {/* PROJECT SPECS */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Project Variables</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500">SqFt</label>
              <input required type="number" className="w-full p-3 border rounded-lg font-bold text-xl" 
                value={estimateData.sqft} onChange={e => setEstimateData({ ...estimateData, sqft: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500">Project Type</label>
              <select className="w-full p-3 border rounded-lg font-bold" 
                value={estimateData.project_type} onChange={e => setEstimateData({ ...estimateData, project_type: e.target.value })}>
                <option value="patio">Patio</option>
                <option value="walkway">Walkway</option>
                <option value="driveway">Driveway</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500">Material Selection</label>
              <select className="w-full p-3 border rounded-lg font-bold" 
                value={estimateData.material_code} onChange={e => setEstimateData({ ...estimateData, material_code: e.target.value })}>
                <option value="barkman_holland">Barkman Holland (Budget)</option>
                <option value="barkman_broadway_65">Barkman Broadway (Budget/Mid)</option>
                <option value="barkman_roman">Barkman Roman (Midrange)</option>
                <option value="belgard_dimensions">Belgard Dimensions (Midrange)</option>
                <option value="barkman_fjord">Barkman Fjord (Premium)</option>
                {/* Add your other materials here */}
              </select>
            </div>
            
            <label className="flex items-center gap-2 p-3 border rounded-lg bg-slate-50 cursor-pointer">
              <input type="checkbox" className="w-5 h-5 accent-amber-500" 
                checked={estimateData.isBackyard} onChange={e => setEstimateData({ ...estimateData, isBackyard: e.target.checked })} />
              <span className="font-bold text-sm">Backyard (+10% Labour)</span>
            </label>
            
            <label className="flex items-center gap-2 p-3 border rounded-lg bg-slate-50 cursor-pointer">
              <input type="checkbox" className="w-5 h-5 accent-amber-500" 
                checked={estimateData.access_level === 'difficult'} 
                onChange={e => setEstimateData({ ...estimateData, access_level: e.target.checked ? 'difficult' : 'medium' })} />
              <span className="font-bold text-sm">Difficult Access (+15%)</span>
            </label>
          </div>
        </div>

        {/* LIVE RESULTS */}
        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-xl flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm font-bold uppercase">Internal Target Price</p>
            <h2 className="text-4xl font-black text-amber-400 mt-1">
              {currentEstimate ? `$${currentEstimate.exact_price.toLocaleString()}` : '$0'}
            </h2>
            {currentEstimate && <p className="text-xs text-slate-400 mt-2">{currentEstimate.details}</p>}
          </div>
          
          <button 
            type="submit" disabled={isSubmitting || !currentEstimate}
            className="px-6 py-4 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-200 disabled:opacity-50 flex items-center gap-2 transition-all">
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
            Save as Lead
          </button>
        </div>

      </form>
    </div>
  )
}
