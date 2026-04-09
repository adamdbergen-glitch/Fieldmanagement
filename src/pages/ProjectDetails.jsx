import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { 
  ArrowLeft, MapPin, Clock, Phone, Navigation, 
  ShieldAlert, ListChecks, Truck, Info, Calendar,
  MessageSquare, Link as LinkIcon, Check, Edit2, Save, X, 
  DollarSign, Receipt, Plus, Trash2, Send, MailQuestion, ListPlus, Loader2
} from 'lucide-react'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import ProjectSOPs from '../components/ProjectSOPs'
import ProjectMaterials from '../components/ProjectMaterials'
import ProjectFiles from '../components/ProjectFiles'
import ProjectCrew from '../components/ProjectCrew'
import ProjectComments from '../components/ProjectComments'

import { useAuth } from '../contexts/AuthContext'
import { can, PERMISSIONS } from '../lib/permissions'

export default function ProjectDetails() {
  const { id } = useParams() 
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { userProfile } = useAuth()
  
  const userRole = userProfile?.role || 'crew'
  const isAdmin = userRole === 'admin'

  const [activeTab, setActiveTab] = useState('overview')
  const [linkCopied, setLinkCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [unreadCount, setUnreadCount] = useState(0)
  const [newMsgToast, setNewMsgToast] = useState(null)
  
  const [isSendingEstimate, setIsSendingEstimate] = useState(false)
  const [isSendingFollowup, setIsSendingFollowup] = useState(false)

  // --- NEW EMAIL MODAL STATE ---
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailDraft, setEmailDraft] = useState({ subject: '', message: '' })

  const [newExpense, setNewExpense] = useState({ description: '', amount: '' })
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false)

  const [newLine, setNewLine] = useState({ title: '', description: '', price: '', is_change_order: false })
  const [isSubmittingLine, setIsSubmittingLine] = useState(false)

  // --- NEW EDITING STATE FOR LINE ITEMS ---
  const [editingLineId, setEditingLineId] = useState(null)
  const [editingLineData, setEditingLineData] = useState({ title: '', description: '', price: '', is_change_order: false })
  const [isUpdatingLine, setIsUpdatingLine] = useState(false)

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*, customer:customers(*)').eq('id', id).single()
      if (error) throw error
      return data
    }
  })

  const { data: lineItems } = useQuery({
    queryKey: ['project_line_items', id],
    queryFn: async () => {
      const { data } = await supabase.from('project_line_items').select('*').eq('project_id', id).order('created_at')
      return data || []
    }
  })

  const { data: expenses } = useQuery({
    queryKey: ['project_expenses', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_expenses').select('*, profile:purchased_by(full_name)').eq('project_id', id).order('purchased_at', { ascending: false })
      if (error) throw error
      return data
    }
  })

  const { data: laborData } = useQuery({
    queryKey: ['project_labor', id],
    queryFn: async () => {
      const { data: logs } = await supabase.from('time_logs').select('clock_in_time, clock_out_time, profile:user_id(wage)').eq('project_id', id).not('clock_out_time', 'is', null) 
      const { data: settings } = await supabase.from('app_settings').select('setting_value').eq('setting_key', 'payroll_config').single()
      return { logs: logs || [], burden: settings?.setting_value?.burden_multiplier || 1.18 }
    }
  })

  const { data: customers } = useQuery({
    queryKey: ['customers_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('id, name').order('name')
      if (error) throw error
      return data
    },
    enabled: isEditing && isAdmin
  })

  const calculatedEstimate = lineItems?.filter(i => i.status !== 'rejected').reduce((sum, item) => sum + Number(item.price), 0) || 0

  const totalExpenses = expenses?.reduce((sum, item) => sum + Number(item.amount), 0) || 0
  const laborCost = laborData?.logs.reduce((total, log) => {
    if (!log.clock_out_time || !log.profile?.wage) return total
    const minutes = differenceInMinutes(parseISO(log.clock_out_time), parseISO(log.clock_in_time))
    return total + ((minutes / 60) * log.profile.wage * laborData.burden)
  }, 0) || 0

  const netProfit = calculatedEstimate - totalExpenses - laborCost

  useEffect(() => {
    const channel = supabase
      .channel('realtime-project-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'project_comments', filter: `project_id=eq.${id}` }, () => {
          queryClient.invalidateQueries(['project_comments', id])
          queryClient.invalidateQueries(['project', id]) 
          if (activeTab !== 'comments') {
            setUnreadCount((prev) => prev + 1)
            setNewMsgToast("New message received!")
            setTimeout(() => setNewMsgToast(null), 4000)
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [id, activeTab, queryClient])

  const handleTabClick = async (tabName) => {
    setActiveTab(tabName)
    if (tabName === 'comments') {
      setUnreadCount(0) 
      if (project?.has_new_client_message) {
        await supabase.from('projects').update({ has_new_client_message: false }).eq('id', id)
        queryClient.invalidateQueries(['project', id])
      }
    }
  }

  const handleEditStart = () => {
    setEditForm({
      name: project.name, status: project.status, start_date: project.start_date, end_date: project.end_date,
      duration_days: project.duration_days || 1, 
      address: project.address || project.customer?.address || '', city: project.city || '',
      customer_id: project.customer_id || '', scope_of_work: project.scope_of_work || '' 
    })
    setIsEditing(true)
  }

  const handleEditSave = async () => {
    try {
      const { error } = await supabase.from('projects').update({
          name: editForm.name, status: editForm.status, start_date: editForm.start_date || null, end_date: editForm.end_date || null,
          duration_days: parseInt(editForm.duration_days) || 1, 
          address: editForm.address, city: editForm.city, customer_id: editForm.customer_id || null, scope_of_work: editForm.scope_of_work
        }).eq('id', id)

      if (error) throw error
      await queryClient.invalidateQueries(['project', id])
      setIsEditing(false)
    } catch (err) { alert("Error saving: " + err.message) }
  }

  const handleAddLineItem = async (e) => {
    e.preventDefault()
    if (!newLine.title || !newLine.price) return
    setIsSubmittingLine(true)
    try {
      const { error } = await supabase.from('project_line_items').insert({
        project_id: id,
        title: newLine.title,
        description: newLine.description,
        price: parseFloat(newLine.price),
        is_change_order: newLine.is_change_order,
        status: 'pending'
      })
      if (error) throw error
      setNewLine({ title: '', description: '', price: '', is_change_order: false })
      queryClient.invalidateQueries(['project_line_items', id])
    } catch (err) {
      alert("Error adding item: " + err.message)
    } finally {
      setIsSubmittingLine(false)
    }
  }

  const handleDeleteLineItem = async (lineId) => {
    if (!window.confirm("Delete this line item?")) return
    await supabase.from('project_line_items').delete().eq('id', lineId)
    queryClient.invalidateQueries(['project_line_items', id])
  }

  // --- NEW EDITING LOGIC FOR LINE ITEMS ---
  const handleEditLineStart = (item) => {
    setEditingLineId(item.id)
    setEditingLineData({
      title: item.title,
      description: item.description || '',
      price: item.price,
      is_change_order: item.is_change_order || false
    })
  }

  const handleEditLineSave = async (lineId) => {
    setIsUpdatingLine(true)
    try {
      const { error } = await supabase.from('project_line_items').update({
        title: editingLineData.title,
        description: editingLineData.description,
        price: parseFloat(editingLineData.price),
        is_change_order: editingLineData.is_change_order
      }).eq('id', lineId)
      
      if (error) throw error
      setEditingLineId(null)
      queryClient.invalidateQueries(['project_line_items', id])
    } catch (err) {
      alert("Error updating item: " + err.message)
    } finally {
      setIsUpdatingLine(false)
    }
  }

  const handleAddExpense = async (e) => {
    e.preventDefault()
    if(!newExpense.description || !newExpense.amount) return
    setIsSubmittingExpense(true)
    try {
      const { error } = await supabase.from('project_expenses').insert({ project_id: id, description: newExpense.description, amount: newExpense.amount, purchased_by: userProfile.id })
      if(error) throw error
      setNewExpense({ description: '', amount: '' })
      queryClient.invalidateQueries(['project_expenses', id])
    } catch(err) { alert(err.message) }
    finally { setIsSubmittingExpense(false) }
  }

  const handleDeleteExpense = async (expenseId) => {
    if(!window.confirm("Delete this expense?")) return
    const { error } = await supabase.from('project_expenses').delete().eq('id', expenseId)
    if(error) alert(error.message)
    else queryClient.invalidateQueries(['project_expenses', id])
  }

  const getGoogleMapsUrl = () => {
    if (!project) return '#'
    const addr = project.address || project.customer?.address
    if (!addr) return '#'
    const fullAddress = project.city ? `${addr}, ${project.city}` : addr
    return `http://googleusercontent.com/maps.google.com/search?q=${encodeURIComponent(fullAddress)}`
  }

  const copyPortalLink = () => {
    const url = `${window.location.origin}/portal/${project.access_token}`
    navigator.clipboard.writeText(url)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const handleStatusUpdate = async (newStatus) => {
    const { error } = await supabase.from('projects').update({ status: newStatus }).eq('id', id)
    if (error) alert('Error updating status')
    else queryClient.invalidateQueries(['project', id])
  }
  
  const handleDelete = async () => {
    if (!window.confirm('PERMANENTLY DELETE PROJECT?')) return
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) alert(error.message)
    else navigate('/projects')
  }

  // --- NEW: Handle opening the Email Modal ---
  const handleOpenEmailModal = (e) => {
    e?.preventDefault();
    if (!project.customer?.email) return alert("This customer doesn't have an email address on file!")
    setEmailDraft({ 
      subject: `Your Project Estimate: ${project.name}`, 
      message: '' 
    })
    setShowEmailModal(true)
  }

  // --- NEW: Handle actually sending the customized Email ---
  const handleConfirmSendEmail = async () => {
    setIsSendingEstimate(true)
    try {
      const res = await fetch('https://pavingstone-chatbot.onrender.com/api/send-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: project.customer.email,
          customerName: project.customer.name,
          projectName: project.name,
          estimateAmount: calculatedEstimate, 
          portalLink: `${window.location.origin}/portal/${project.access_token}`,
          customSubject: emailDraft.subject,
          customMessage: emailDraft.message
        })
      })
      if (!res.ok) throw new Error("Failed to send")
      alert("Estimate sent successfully!")
      setShowEmailModal(false)
    } catch (err) { alert(err.message) } 
    finally { setIsSendingEstimate(false) }
  }

  const handleSendFollowupEmail = async (e) => {
    e?.preventDefault();
    if (!project.customer?.email) return alert("This customer doesn't have an email address on file!")
    setIsSendingFollowup(true)
    try {
      const res = await fetch('https://pavingstone-chatbot.onrender.com/api/send-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: project.customer.email,
          customerName: project.customer.name,
          projectName: project.name,
          portalLink: `${window.location.origin}/portal/${project.access_token}`
        })
      })
      if (!res.ok) throw new Error("Failed to send")
      alert("Follow up sent successfully!")
    } catch (err) { alert(err.message) } 
    finally { setIsSendingFollowup(false) }
  }

  if (isLoading) return <div className="p-10 text-center text-slate-500">Loading command center...</div>
  if (error) return <div className="p-10 text-red-500">Error: {error.message}</div>

  return (
    <div className="max-w-5xl mx-auto pb-20 md:pb-12 bg-slate-50 min-h-screen flex flex-col relative">
      
      {newMsgToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <div><p className="font-bold text-sm">Site Log Update</p></div>
            <button onClick={() => handleTabClick('comments')} className="ml-4 bg-amber-500 text-slate-900 text-xs font-bold px-3 py-1.5 rounded">View</button>
          </div>
        </div>
      )}

      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="px-6 pt-6 pb-4">
          <button onClick={() => navigate('/projects')} className="flex items-center text-slate-400 hover:text-slate-800 mb-4 text-xs font-bold uppercase tracking-wider transition-colors">
            <ArrowLeft size={14} className="mr-1" /> Projects
          </button>

          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="flex-1 w-full">
              {isEditing && isAdmin ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 bg-slate-50 p-4 rounded-lg border border-amber-200">
                   <input className="w-full text-xl md:text-2xl font-extrabold border-b-2 border-amber-500 focus:outline-none bg-transparent p-1"
                      value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} placeholder="Project Name" />
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Status</label>
                       <select className="w-full p-2 border border-slate-300 rounded-lg font-bold text-sm bg-white" value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                          <option value="New">New</option>
                          <option value="Scheduled">Scheduled</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                          <option value="Paused">Paused</option>
                       </select>
                     </div>
                     <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Assigned Customer</label>
                        <select className="w-full p-2 border border-slate-300 rounded-lg font-bold text-sm bg-white" value={editForm.customer_id} onChange={e => setEditForm({...editForm, customer_id: e.target.value})}>
                          <option value="">-- No Customer --</option>
                          {customers?.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                       </select>
                     </div>
                   </div>

                   <div>
                      <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Scope of Work & Notes</label>
                      <textarea className="w-full p-3 border border-slate-300 rounded-lg bg-white min-h-[150px] font-mono text-sm" value={editForm.scope_of_work} onChange={e => setEditForm({...editForm, scope_of_work: e.target.value})} />
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Start Date</label>
                        <input type="date" className="w-full p-2 border border-slate-300 rounded-lg bg-white" value={editForm.start_date || ''} onChange={e => setEditForm({...editForm, start_date: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">End Date</label>
                        <input type="date" className="w-full p-2 border border-slate-300 rounded-lg bg-white" value={editForm.end_date || ''} onChange={e => setEditForm({...editForm, end_date: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Duration (Days)</label>
                        <input type="number" min="1" className="w-full p-2 border border-slate-300 rounded-lg bg-white" value={editForm.duration_days || 1} onChange={e => setEditForm({...editForm, duration_days: e.target.value})} />
                      </div>
                   </div>

                   <div>
                      <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Site Address</label>
                      <input className="w-full p-2 border border-slate-300 rounded-lg bg-white mb-2" placeholder="Street Address" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} />
                      <input className="w-full p-2 border border-slate-300 rounded-lg bg-white" placeholder="City" value={editForm.city} onChange={e => setEditForm({...editForm, city: e.target.value})} />
                   </div>

                   <div className="flex gap-3 pt-2">
                      <button onClick={handleEditSave} className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg font-bold flex justify-center items-center gap-2 hover:bg-green-700"><Save size={18} /> Save</button>
                      <button onClick={() => setIsEditing(false)} className="flex-1 bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg font-bold flex justify-center items-center gap-2 hover:bg-slate-50"><X size={18} /> Cancel</button>
                   </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start">
                    <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 leading-tight">{project.name}</h1>
                    {isAdmin && (
                      <button onClick={handleEditStart} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-all ml-2"><Edit2 size={18} /></button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide border ${project.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{project.status}</span>
                    {project.start_date && (<span className="flex items-center gap-1 text-slate-500 font-medium text-xs"><Calendar size={14} /> {format(parseISO(project.start_date), 'MMM d')}</span>)}
                    {project.duration_days && (<span className="flex items-center gap-1 text-slate-500 font-medium text-xs"><Clock size={14} /> {project.duration_days} Day{project.duration_days > 1 ? 's' : ''}</span>)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {!isEditing && (
          <>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Client</p>
                {project.customer ? <p className="font-bold text-slate-800 text-sm">{project.customer.name}</p> : <p className="italic text-slate-400 text-sm">No client</p>}
              </div>
              <div className="flex gap-2">
                {project.customer?.phone && <a href={`tel:${project.customer.phone}`} className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 hover:text-green-600"><Phone size={18} /></a>}
                <a href={getGoogleMapsUrl()} target="_blank" rel="noreferrer" className="w-10 h-10 flex items-center justify-center rounded-full bg-amber-500 text-slate-900 hover:bg-amber-400"><Navigation size={18} /></a>
              </div>
            </div>

            <div className="px-4 md:px-6 flex space-x-6 overflow-x-auto no-scrollbar bg-white">
              {['overview', 'finances', 'sops', 'materials', 'comments']
                .filter(tab => tab !== 'finances' || isAdmin) // SECURITY: Hide finances from crew
                .map(tab => (
                <button key={tab} onClick={() => handleTabClick(tab)} 
                  className={`pb-3 pt-3 text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-2 capitalize transition-colors ${activeTab === tab ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400'}`}>
                  {tab === 'finances' ? <DollarSign size={18} /> : 
                   tab === 'sops' ? <ListChecks size={18} /> :
                   tab === 'materials' ? <Truck size={18} /> :
                   tab === 'comments' ? <MessageSquare size={18} /> : <Info size={18} />}
                   {tab === 'sops' ? 'Checklists' : tab === 'comments' ? 'Site Log' : tab}
                   {tab === 'comments' && unreadCount > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {!isEditing && (
        <div className="p-4 md:p-6 flex-1">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2">
              <div className="lg:col-span-2 space-y-6">
                
                {/* --- ITEM BUILDER (QUOTE/CHANGE ORDERS) --- */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <ListPlus size={14} /> Itemized Quote Builder
                  </h3>

                  {/* List Current Items */}
                  <div className="space-y-3 mb-4">
                    {lineItems?.map(item => (
                       <div key={item.id} className={`flex justify-between items-start p-3 border rounded-lg ${item.status === 'rejected' ? 'bg-slate-100 border-slate-200 opacity-50' : 'bg-slate-50 border-slate-200'}`}>
                          
                          {/* --- EDIT MODE FOR THIS ITEM --- */}
                          {editingLineId === item.id ? (
                            <div className="flex flex-col gap-3 w-full animate-in fade-in">
                              <div className="flex gap-2">
                                <input className="flex-1 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none text-sm" value={editingLineData.title} onChange={e=>setEditingLineData({...editingLineData, title: e.target.value})} />
                                <input type="number" step="0.01" className="w-32 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none text-sm" value={editingLineData.price} onChange={e=>setEditingLineData({...editingLineData, price: e.target.value})} />
                              </div>
                              <input className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none text-sm" value={editingLineData.description} onChange={e=>setEditingLineData({...editingLineData, description: e.target.value})} />
                              <label className="flex items-center gap-2 text-sm text-slate-600 font-bold cursor-pointer w-fit">
                                <input type="checkbox" checked={editingLineData.is_change_order} onChange={e=>setEditingLineData({...editingLineData, is_change_order: e.target.checked})} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                                Change Order
                              </label>
                              <div className="flex gap-2 mt-1">
                                <button onClick={() => handleEditLineSave(item.id)} disabled={isUpdatingLine} className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors">Save Changes</button>
                                <button onClick={() => setEditingLineId(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div>
                                <p className={`font-bold ${item.status === 'rejected' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                                  {item.title} 
                                  {item.is_change_order && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded ml-2 uppercase font-bold tracking-wider">Change Order</span>}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                                
                                {isAdmin && (
                                  <p className={`text-[10px] font-bold mt-2 uppercase tracking-wider ${item.status === 'approved' ? 'text-green-600' : item.status === 'rejected' ? 'text-red-500' : 'text-amber-500'}`}>
                                    Status: {item.status}
                                  </p>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-4">
                                {isAdmin && <span className="font-bold text-slate-900">${Number(item.price).toLocaleString()}</span>}
                                {isAdmin && (
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => handleEditLineStart(item)} className="text-slate-400 hover:text-blue-500"><Edit2 size={16}/></button>
                                    <button onClick={() => handleDeleteLineItem(item.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16}/></button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                       </div>
                    ))}
                    {lineItems?.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">No line items added yet.</p>}
                  </div>

                  {/* Add New Item Form (Admin Only) */}
                  {isAdmin && (
                    <form onSubmit={handleAddLineItem} className="flex flex-col gap-3 border-t border-slate-100 pt-4">
                       <div className="flex gap-2">
                         <input required placeholder="Item Title (e.g. 15x15 Patio)" className="flex-1 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none text-sm" value={newLine.title} onChange={e=>setNewLine({...newLine, title: e.target.value})} />
                         <input required type="number" step="0.01" placeholder="Price ($)" className="w-32 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none text-sm" value={newLine.price} onChange={e=>setNewLine({...newLine, price: e.target.value})} />
                       </div>
                       <input placeholder="Description (Optional)" className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none text-sm" value={newLine.description} onChange={e=>setNewLine({...newLine, description: e.target.value})} />
                       <label className="flex items-center gap-2 text-sm text-slate-600 font-bold mt-1 cursor-pointer w-fit">
                         <input type="checkbox" checked={newLine.is_change_order} onChange={e=>setNewLine({...newLine, is_change_order: e.target.checked})} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                         This is a Mid-Project Change Order
                       </label>
                       <button disabled={isSubmittingLine} className="bg-slate-900 text-white font-bold py-2 rounded-lg mt-2 hover:bg-slate-800 disabled:opacity-50 transition-colors">
                         Add Item to Quote
                       </button>
                    </form>
                  )}
                  
                  {/* Total Estimate (Admin Only) */}
                  {isAdmin && (
                    <div className="mt-4 pt-4 border-t-2 border-slate-800 flex justify-between items-center">
                       <span className="font-bold text-slate-800 uppercase tracking-widest text-xs">Total Active Estimate:</span>
                       <span className="text-2xl font-black text-amber-500">${calculatedEstimate.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><ListChecks size={14} /> Scope of Work & Notes</h3>
                  {project.scope_of_work ? (
                    <div className="text-slate-700 whitespace-pre-wrap text-sm font-mono bg-slate-50 p-4 rounded border border-slate-100">{project.scope_of_work}</div>
                  ) : <p className="text-slate-400 italic text-sm">No scope of work defined yet.</p>}
                  {(project.address || project.customer?.address) && (
                    <div className="mt-6 pt-6 border-t border-slate-100">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Site Address</p>
                      <p className="font-bold text-slate-700">{project.address || project.customer.address}, {project.city}</p>
                    </div>
                  )}
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"><ProjectFiles projectId={id} /></div>
              </div>
              
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg p-5 text-white">
                  <h3 className="font-bold mb-2 flex items-center gap-2"><Navigation size={18} /> Client Portal</h3>
                  <p className="text-amber-100 text-xs mb-4">Share this link with the client.</p>
                  <div className="flex gap-2 mb-4">
                    <div className="flex-1 bg-black/10 rounded px-3 py-2 text-xs font-mono text-amber-100 truncate border border-white/10">
                      {project.access_token ? `${window.location.origin}/portal/${project.access_token}` : "Generating..."}
                    </div>
                    <button onClick={copyPortalLink} className="bg-white text-amber-600 px-3 py-2 rounded font-bold text-xs">
                      {linkCopied ? <Check size={14} /> : <LinkIcon size={14} />}
                    </button>
                  </div>
                  
                  {isAdmin && (
                    <div className="space-y-2">
                      {/* --- UPDATED BUTTON --- */}
                      <button type="button" onClick={handleOpenEmailModal} disabled={isSendingEstimate || calculatedEstimate <= 0} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                        {isSendingEstimate ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        Email Estimate to Client
                      </button>
                      {project.status === 'New' && (
                        <button type="button" onClick={handleSendFollowupEmail} disabled={isSendingFollowup} className="w-full bg-white/20 hover:bg-white/30 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                          {isSendingFollowup ? <Loader2 size={16} className="animate-spin" /> : <MailQuestion size={16} />}
                          Send Quick Follow-up
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {can(userRole, PERMISSIONS.CAN_UPDATE_STATUS) && (
                  <div className="bg-slate-800 rounded-xl shadow-sm p-5 text-white">
                    <h3 className="font-bold mb-4 flex items-center gap-2 text-amber-400"><ShieldAlert size={18} /> Job Controls</h3>
                    <div className="grid gap-3">
                      {project.status !== 'In Progress' && <button onClick={() => handleStatusUpdate('In Progress')} className="bg-slate-700 hover:bg-slate-600 font-bold py-3 rounded">Start Job</button>}
                      {project.status !== 'Completed' && <button onClick={() => handleStatusUpdate('Completed')} className="bg-green-600 hover:bg-green-500 font-bold py-3 rounded">Mark Complete</button>}
                    </div>
                    {can(userRole, PERMISSIONS.CAN_DELETE_PROJECT) && <button onClick={handleDelete} className="mt-6 w-full text-red-400 text-xs font-bold uppercase py-2">Delete Project</button>}
                  </div>
                )}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"><ProjectCrew projectId={id} /></div>
              </div>
            </div>
          )}

          {activeTab === 'finances' && isAdmin && (
            <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Estimate</p>
                  <p className="text-2xl font-black text-slate-900">${calculatedEstimate.toLocaleString()}</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Expenses</p>
                  <p className="text-2xl font-black text-red-600">-${totalExpenses.toFixed(2)}</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Labor Cost</p>
                  <p className="text-2xl font-black text-orange-600">-${laborCost.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Includes {((laborData?.burden || 1.18) - 1).toFixed(2) * 100}% Burden</p>
                </div>
                <div className={`p-5 rounded-xl border shadow-sm ${netProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <p className={`text-xs font-bold uppercase tracking-widest ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>Net Profit</p>
                  <p className={`text-2xl font-black ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>${netProfit.toFixed(2)}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Receipt size={20} /> Expense Log</h3>
                <form onSubmit={handleAddExpense} className="flex flex-col md:flex-row gap-3 mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <input className="flex-1 p-2 border rounded text-sm" placeholder="Item (e.g. Gas, Gravel)" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} />
                  <input type="number" className="w-32 p-2 border rounded text-sm" placeholder="Cost ($)" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} />
                  <button disabled={isSubmittingExpense} className="bg-slate-900 text-white px-4 py-2 rounded font-bold text-sm flex items-center justify-center gap-1 hover:bg-slate-800"><Plus size={16} /> Add</button>
                </form>
                <div className="space-y-3">
                  {expenses?.length === 0 && <p className="text-center text-slate-400 py-4 text-sm">No expenses logged yet.</p>}
                  {expenses?.map(ex => (
                    <div key={ex.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-100 transition-colors group">
                      <div>
                        <p className="font-bold text-slate-800">{ex.description}</p>
                        <p className="text-xs text-slate-500">{format(parseISO(ex.purchased_at), 'MMM d, h:mm a')} • by {ex.profile?.full_name || 'Unknown'}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono font-bold text-red-600">-${Number(ex.amount).toFixed(2)}</span>
                        {isAdmin && <button onClick={() => handleDeleteExpense(ex.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'sops' && <div className="animate-in fade-in slide-in-from-bottom-2 bg-white rounded-xl shadow-sm border border-slate-200 p-1 md:p-6"><ProjectSOPs projectId={id} /></div>}
          {activeTab === 'materials' && <div className="animate-in fade-in slide-in-from-bottom-2 bg-white rounded-xl shadow-sm border border-slate-200 p-1 md:p-6"><ProjectMaterials projectId={id} /></div>}
          {activeTab === 'comments' && <div className="animate-in fade-in slide-in-from-bottom-2 bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6"><ProjectComments projectId={id} /></div>}
        </div>
      )}

      {/* --- NEW EMAIL COMPOSER MODAL --- */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Send size={18} className="text-amber-500"/> Draft Email</h3>
              <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">To</label>
                <input disabled className="w-full p-2 border border-slate-200 rounded bg-slate-50 text-slate-500 cursor-not-allowed text-sm" value={project.customer?.email} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Subject</label>
                <input 
                  className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none text-sm" 
                  value={emailDraft.subject} 
                  onChange={e => setEmailDraft({...emailDraft, subject: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Custom Message / Links</label>
                <textarea 
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm min-h-[120px]" 
                  placeholder="e.g. Here is a link to the Barkman catalog: https://barkmanconcrete.com/..."
                  value={emailDraft.message} 
                  onChange={e => setEmailDraft({...emailDraft, message: e.target.value})} 
                />
                <p className="text-[10px] text-slate-400 mt-1">This text will be highlighted in a yellow box inside the standard estimate email template.</p>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowEmailModal(false)} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={handleConfirmSendEmail} disabled={isSendingEstimate} className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2">
                 {isSendingEstimate ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
