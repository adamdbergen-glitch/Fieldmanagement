import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'

export default function NewProject() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    // Customer Info
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    address: '', // Shared between Customer and Project
    
    // Project Info
    description: '',
    status: 'New',
    start_date: '',
    duration_days: 1
  })

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // STEP 1: Create the Customer first
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .insert([{
          name: formData.customer_name,
          phone: formData.customer_phone,
          email: formData.customer_email,
          address: formData.address
        }])
        .select()
        .single()

      if (customerError) throw customerError
      const customerId = customerData.id

      // STEP 2: Create the Project linked to that Customer
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert([{
          customer_id: customerId,
          name: formData.description, // We use the description as the Project Name
          address: formData.address,  // Job site address
          status: formData.status,
          start_date: formData.start_date || null,
          duration_days: formData.duration_days
        }])
        .select()

      if (projectError) throw projectError

      // Success! Redirect to the new project
      navigate(`/projects/${projectData[0].id}`)

    } catch (error) {
      console.error('Error:', error)
      alert('Error creating project: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <Link to="/projects" className="text-slate-500 hover:text-slate-800 flex items-center gap-2 mb-4">
        <ArrowLeft size={16} /> Back to Projects
      </Link>
      <h1 className="text-3xl font-bold text-slate-900 mb-8">New Project</h1>

      <form onSubmit={handleSubmit} className="bg-white shadow-sm border border-slate-200 rounded-xl p-8 space-y-8">
        
        {/* Customer Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 border-b pb-2">Customer Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name *</label>
              <input required name="customer_name" value={formData.customer_name} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded" placeholder="e.g. Walter Smith" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input name="customer_phone" value={formData.customer_phone} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded" placeholder="204-555-0123" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address *</label>
            <input required name="address" value={formData.address} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded" placeholder="123 Maple Dr" />
          </div>
        </div>

        {/* Project Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 border-b pb-2">Project Details</h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description / Title *</label>
            <input required name="description" value={formData.description} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded" placeholder="e.g. Driveway Tear-out and Replace" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input type="date" name="start_date" value={formData.start_date} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duration (Days)</label>
              <input type="number" name="duration_days" value={formData.duration_days} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded" />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button type="submit" disabled={loading} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-6 py-2 rounded flex items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={20} /> : <><Save size={20} /> Create Project</>}
          </button>
        </div>
      </form>
    </div>
  )
}