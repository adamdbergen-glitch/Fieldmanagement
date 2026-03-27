import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Search, Phone, Mail, MapPin, Trash2, Plus, X, User, Edit2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { can, PERMISSIONS } from '../lib/permissions'

export default function Customers() {
  const { userProfile } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false) 

  // Form State
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', email: '', address: '' })

  useEffect(() => {
    fetchCustomers()
  }, [])

  async function fetchCustomers() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error('Error fetching customers:', error.message)
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingCustomer(null)
    setCustomerForm({ name: '', phone: '', email: '', address: '' })
    setShowModal(true)
  }

  const openEditModal = (customer) => {
    setEditingCustomer(customer)
    setCustomerForm({ 
      name: customer.name, 
      phone: customer.phone || '', 
      email: customer.email || '', 
      address: customer.address || '' 
    })
    setShowModal(true)
  }

  // Handle Create OR Update
  async function handleSave(e) {
    e.preventDefault()
    
    if (editingCustomer) {
      // UPDATE EXISTING
      const { data, error } = await supabase
        .from('customers')
        .update(customerForm)
        .eq('id', editingCustomer.id)
        .select()

      if (error) {
        alert('Error updating customer: ' + error.message)
      } else {
        setCustomers(customers.map(c => c.id === editingCustomer.id ? data[0] : c))
        setShowModal(false)
      }
    } else {
      // CREATE NEW
      const { data, error } = await supabase
        .from('customers')
        .insert([customerForm])
        .select()

      if (error) {
        alert('Error creating customer: ' + error.message)
      } else {
        setCustomers([...customers, data[0]]) 
        setShowModal(false) 
      }
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this customer? This will NOT delete their project history, but will remove them from this list.')) return
    
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)

    if (error) {
      alert('Error deleting: ' + error.message)
    } else {
      setCustomers(customers.filter(c => c.id !== id))
    }
  }

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm) ||
    c.address?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto p-8">
      
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-500 mt-1">
            {customers.length} {customers.length === 1 ? 'Client' : 'Clients'} on file
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search clients..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {/* ADD BUTTON */}
          {can(userProfile?.role, PERMISSIONS.CAN_MANAGE_CREW) && (
            <button 
              onClick={openCreateModal} 
              className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Plus size={20} /> Add Client
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading customers...</div>
      ) : filteredCustomers.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-dashed border-slate-300 text-center">
          <User className="mx-auto text-slate-300 mb-4" size={48} />
          <h3 className="text-lg font-bold text-slate-900">No customers found</h3>
          <p className="text-slate-500 mb-4">
            {searchTerm ? `No results for "${searchTerm}"` : "Get started by adding your first client."}
          </p>
          {!searchTerm && (
             <button onClick={openCreateModal} className="text-amber-600 font-bold hover:underline">
               Add New Client
             </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCustomers.map((customer) => (
            <div key={customer.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative group">
              
              {/* EDIT / DELETE CONTROLS (Admin Only) */}
              {can(userProfile?.role, PERMISSIONS.CAN_DELETE_PROJECT) && (
                <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all bg-white shadow-sm border border-slate-100 rounded-md p-1 z-10">
                  <button 
                    onClick={() => openEditModal(customer)}
                    className="text-slate-400 hover:text-blue-500 p-1.5 hover:bg-blue-50 rounded"
                    title="Edit Customer"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => handleDelete(customer.id)}
                    className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded"
                    title="Delete Customer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-lg shrink-0">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 truncate max-w-[160px]" title={customer.name}>{customer.name}</h3>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Client</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <span>{customer.phone || 'No phone'}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-slate-400 shrink-0" />
                  <span className="truncate">{customer.email || 'No email'}</span>
                </div>

                {customer.address && (
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                    <span className="line-clamp-2 leading-tight">{customer.address}</span>
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT CUSTOMER POPUP MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">
                {editingCustomer ? 'Edit Customer Details' : 'Add New Customer'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name *</label>
                <input 
                  required 
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none" 
                  placeholder="e.g. Jane Doe"
                  value={customerForm.name} 
                  onChange={e => setCustomerForm({...customerForm, name: e.target.value})} 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Phone</label>
                  <input 
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none" 
                    placeholder="204-555-0199"
                    value={customerForm.phone} 
                    onChange={e => setCustomerForm({...customerForm, phone: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                  <input 
                    type="email"
                    className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none" 
                    placeholder="jane@example.com"
                    value={customerForm.email} 
                    onChange={e => setCustomerForm({...customerForm, email: e.target.value})} 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Address</label>
                <input 
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none" 
                  placeholder="123 Main St, Winnipeg"
                  value={customerForm.address} 
                  onChange={e => setCustomerForm({...customerForm, address: e.target.value})} 
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-3 rounded-lg mt-2 transition-colors"
              >
                {editingCustomer ? 'Update Customer' : 'Save Customer'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
