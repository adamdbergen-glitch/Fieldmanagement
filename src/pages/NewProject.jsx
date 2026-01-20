import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { 
  Save, X, UploadCloud, FileText, DollarSign, Calendar, MapPin, User, Loader2, Search, UserPlus 
} from 'lucide-react'

export default function NewProject() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth() // Get current user for file upload tracking
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [files, setFiles] = useState([])
  
  // MODE TOGGLE: 'existing' or 'new'
  const [customerMode, setCustomerMode] = useState('existing') 

  // New Customer Form State
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    address: '' // Added address here for the customer profile
  })

  // Project Form State
  const [formData, setFormData] = useState({
    name: '',
    customer_id: '',
    address: '',
    city: '',
    start_date: '',
    estimate: '',
    scope_of_work: ''
  })

  // Fetch Existing Customers
  const { data: customers, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('id, name').order('name')
      if (error) throw error
      return data
    }
  })

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleNewCustomerChange = (e) => {
    setNewCustomer({ ...newCustomer, [e.target.name]: e.target.value })
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      let finalCustomerId = formData.customer_id

      // --- STEP 1: Handle Customer (Create New or Use Existing) ---
      if (customerMode === 'new') {
        if (!newCustomer.name) throw new Error("Customer Name is required")
        
        // Create the new customer
        const { data: createdCust, error: custError } = await supabase
          .from('customers')
          .insert({
            name: newCustomer.name,
            email: newCustomer.email,
            phone: newCustomer.phone,
            address: newCustomer.address
          })
          .select()
          .single()
        
        if (custError) throw custError
        
        // Use this new ID for the project
        finalCustomerId = createdCust.id
        
        // Refresh customer list in background
        queryClient.invalidateQueries(['customers'])
      } else {
        if (!finalCustomerId) throw new Error("Please select a customer")
      }

      // --- STEP 2: Create the Project ---
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: formData.name,
          customer_id: finalCustomerId,
          address: formData.address, // Project site address
          city: formData.city,
          start_date: formData.start_date || null,
          estimate: formData.estimate ? parseFloat(formData.estimate) : 0,
          scope_of_work: formData.scope_of_work,
          status: 'New'
        })
        .select()
        .single()

      if (projectError) throw projectError

      // --- STEP 3: Upload Files (if any) ---
      if (files.length > 0) {
        for (const file of files) {
          const fileExt = file.name.split('.').pop()
          // Organize files by Project ID
          const fileName = `${projectData.id}/${Date.now()}.${fileExt}`
          
          // A. Upload to Bucket
          const { error: uploadError } = await supabase.storage
            .from('project-files')
            .upload(fileName, file)

          if (uploadError) throw uploadError

          // B. Get Public URL
          const { data: urlData } = supabase.storage
            .from('project-files')
            .getPublicUrl(fileName)

          // C. Save Reference to Database (using your existing project_files table)
          await supabase.from('project_files').insert({
            project_id: projectData.id,
            file_name: file.name,
            file_url: urlData.publicUrl,
            file_type: fileExt,
            uploaded_by: user?.id // Tracks who uploaded it
          })
        }
      }

      // Done! Go to the projects list
      navigate('/projects')

    } catch (error) {
      alert('Error: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Create New Project</h1>
        <button onClick={() => navigate('/projects')} className="text-slate-500 hover:text-slate-700">
          <X size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* SECTION 1: CUSTOMER SELECTION */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <User size={20} className="text-blue-600" /> Customer Information
          </h2>

          {/* Toggle Buttons */}
          <div className="flex bg-slate-100 p-1 rounded-lg mb-6 w-full md:w-fit">
            <button
              type="button"
              onClick={() => setCustomerMode('existing')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-bold transition-all ${
                customerMode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 justify-center"><Search size={16}/> Select Existing</div>
            </button>
            <button
              type="button"
              onClick={() => setCustomerMode('new')}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-bold transition-all ${
                customerMode === 'new' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 justify-center"><UserPlus size={16}/> Create New</div>
            </button>
          </div>

          {customerMode === 'existing' ? (
            // EXISTING CUSTOMER DROPDOWN
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Select Customer</label>
              {loadingCustomers ? (
                <div className="p-3 bg-slate-50 rounded-lg text-slate-400 text-sm">Loading customers...</div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                  <select
                    name="customer_id"
                    className="w-full p-3 pl-10 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 bg-white"
                    value={formData.customer_id}
                    onChange={handleChange}
                  >
                    <option value="">Choose a person...</option>
                    {customers?.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            // NEW CUSTOMER INPUTS
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
                <input 
                  required={customerMode === 'new'}
                  name="name"
                  placeholder="e.g. John Doe"
                  className="w-full p-3 border border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                  value={newCustomer.name}
                  onChange={handleNewCustomerChange}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                <input 
                  type="email"
                  name="email"
                  placeholder="john@example.com"
                  className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                  value={newCustomer.email}
                  onChange={handleNewCustomerChange}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Phone</label>
                <input 
                  type="tel"
                  name="phone"
                  placeholder="(555) 123-4567"
                  className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                  value={newCustomer.phone}
                  onChange={handleNewCustomerChange}
                />
              </div>
               <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-1">Billing Address</label>
                <input 
                  name="address"
                  placeholder="Billing Address (if different from site)"
                  className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                  value={newCustomer.address}
                  onChange={handleNewCustomerChange}
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: PROJECT DETAILS */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <FileText size={20} className="text-amber-500" /> Project Details
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-1">Project Name / Description</label>
              <input 
                required
                name="name"
                placeholder="e.g. Backyard Patio & Firepit"
                className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500"
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 text-slate-400" size={18} />
                <input 
                  type="date"
                  name="start_date"
                  className="w-full p-3 pl-10 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500"
                  value={formData.start_date}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">City</label>
              <input 
                name="city"
                placeholder="e.g. Winnipeg"
                className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500"
                value={formData.city}
                onChange={handleChange}
              />
            </div>

             <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-1">Job Site Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                <input 
                  name="address"
                  placeholder="Street Address"
                  className="w-full p-3 pl-10 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500"
                  value={formData.address}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: SCOPE & FINANCIALS */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <DollarSign size={20} className="text-green-600" /> Scope & Financials
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Project Estimate ($)</label>
              <div className="relative">
                <span className="absolute left-4 top-3 text-slate-500 font-bold">$</span>
                <input 
                  type="number"
                  step="0.01"
                  name="estimate"
                  placeholder="0.00"
                  className="w-full p-3 pl-8 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500 font-mono text-lg"
                  value={formData.estimate}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Scope of Work</label>
              <textarea 
                name="scope_of_work"
                rows="5"
                placeholder="Describe the work to be done in detail..."
                className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-500"
                value={formData.scope_of_work}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        {/* SECTION 4: DOCUMENTS */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <UploadCloud size={20} className="text-blue-500" /> Project Documents
          </h2>
          
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors">
            <input 
              type="file" 
              multiple
              id="file-upload"
              className="hidden" 
              onChange={handleFileChange}
            />
            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
              <UploadCloud size={40} className="text-slate-400 mb-2" />
              <span className="text-sm font-bold text-slate-700">Click to upload files</span>
              <span className="text-xs text-slate-500 mt-1">PDFs, Images, Plans (Max 50MB)</span>
            </label>
          </div>

          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-slate-100 rounded text-sm">
                  <span className="truncate max-w-xs font-medium text-slate-700">{file.name}</span>
                  <span className="text-slate-500 text-xs bg-slate-200 px-2 py-1 rounded">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-4 pt-4">
          <button 
            type="button"
            onClick={() => navigate('/projects')}
            className="flex-1 py-3 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-3 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save size={20} />}
            Create Project
          </button>
        </div>

      </form>
    </div>
  )
}