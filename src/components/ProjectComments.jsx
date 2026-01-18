import React, { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Send, MessageSquare, Trash2, User, Image as ImageIcon, X, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { formatDistanceToNow } from 'date-fns'

export default function ProjectComments({ projectId }) {
  const { userProfile } = useAuth()
  const queryClient = useQueryClient()
  
  // State
  const [newComment, setNewComment] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Refs (for the hidden file input)
  const fileInputRef = useRef(null)

  // 1. Fetch Comments
  const { data: comments, isLoading } = useQuery({
    queryKey: ['project_comments', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_comments')
        .select('*, profile:profiles(full_name, role)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true }) 
      
      if (error) throw error
      return data
    }
  })

  // 2. Handle Submit (Text + Optional Image)
  const handleSubmit = async (e) => {
    e.preventDefault()
    if ((!newComment.trim() && !selectedFile) || isSubmitting) return

    setIsSubmitting(true)

    try {
      let attachmentUrl = null

      // A. Upload Image if selected
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
        
        // We reuse the 'portal-uploads' bucket since it's already set up for images
        const { error: uploadError } = await supabase.storage
          .from('portal-uploads')
          .upload(fileName, selectedFile)

        if (uploadError) throw uploadError

        // Get the Public URL
        const { data: urlData } = supabase.storage
          .from('portal-uploads')
          .getPublicUrl(fileName)
          
        attachmentUrl = urlData.publicUrl
      }

      // B. Save Comment to Database
      const { error } = await supabase.from('project_comments').insert({
        project_id: projectId,
        user_id: userProfile.id,
        content: newComment,
        attachment_url: attachmentUrl
      })

      if (error) throw error

      // C. Reset Form
      setNewComment('')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      
      // D. Refresh Data
      queryClient.invalidateQueries(['project_comments', projectId])

    } catch (err) {
      console.error(err)
      alert('Error posting message: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 3. Delete Comment
  const handleDelete = async (id) => {
    if (!confirm('Delete this note?')) return
    await supabase.from('project_comments').delete().eq('id', id)
    queryClient.invalidateQueries(['project_comments', projectId])
  }

  return (
    <div className="flex flex-col h-[600px] md:h-auto relative">
      
      {/* HEADER */}
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
        <MessageSquare className="text-amber-500" size={20} />
        <h3 className="font-bold text-slate-900">Site Log & Photos</h3>
        <span className="text-xs text-slate-400 ml-auto bg-slate-50 px-2 py-1 rounded-full border border-slate-100">
          Visible to everyone
        </span>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 max-h-[500px]">
        {isLoading && <div className="flex justify-center p-4"><Loader2 className="animate-spin text-amber-500" /></div>}
        
        {comments?.length === 0 && (
          <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p className="text-slate-400 text-sm">No notes yet. Start the conversation!</p>
          </div>
        )}

        {comments?.map((msg) => {
          const isMe = msg.user_id === userProfile.id
          const isClient = msg.is_from_client

          // Style Logic
          let bubbleStyle = 'bg-white text-slate-700 border-slate-200 rounded-tl-none' // Default
          let alignStyle = 'flex-row'

          if (isMe) {
            bubbleStyle = 'bg-amber-100 text-slate-900 border-amber-200 rounded-tr-none'
            alignStyle = 'flex-row-reverse'
          } else if (isClient) {
            bubbleStyle = 'bg-blue-50 text-blue-900 border-blue-200 rounded-tl-none shadow-sm'
            alignStyle = 'flex-row'
          }

          return (
            <div key={msg.id} className={`flex gap-3 ${alignStyle} group`}>
              
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border 
                ${isClient ? 'bg-blue-100 text-blue-700 border-blue-200' : 
                  isMe ? 'bg-amber-200 text-amber-800 border-amber-300' : 
                  'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {isClient ? <User size={14} /> : (msg.profile?.full_name?.charAt(0) || '?')}
              </div>

              {/* Bubble */}
              <div className={`relative max-w-[80%] p-3 rounded-xl text-sm leading-relaxed border ${bubbleStyle}`}>
                
                {/* Meta Header */}
                <div className={`flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-wide opacity-60`}>
                   <span>{isClient ? 'CLIENT' : msg.profile?.full_name}</span>
                   <span>{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</span>
                </div>

                {/* Text Content */}
                {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

                {/* Image Content */}
                {msg.attachment_url && (
                  <div className="mt-2">
                    <a href={msg.attachment_url} target="_blank" rel="noreferrer">
                      <img 
                        src={msg.attachment_url} 
                        alt="Site Photo" 
                        className="rounded-lg border border-black/10 max-h-48 object-cover hover:opacity-95 transition-opacity bg-white" 
                        loading="lazy"
                      />
                    </a>
                  </div>
                )}

                {/* Delete (Hover) */}
                {(isMe || userProfile.role === 'admin') && (
                  <button 
                    onClick={() => handleDelete(msg.id)}
                    className="absolute -right-8 top-2 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* INPUT AREA */}
      <div className="mt-auto bg-white pt-2">
        {/* Preview Selected Image */}
        {selectedFile && (
          <div className="flex items-center gap-2 mb-2 bg-slate-50 p-2 rounded-lg border border-slate-200 inline-flex">
            <ImageIcon size={14} className="text-slate-400" />
            <span className="text-xs text-slate-600 truncate max-w-[150px]">{selectedFile.name}</span>
            <button onClick={() => setSelectedFile(null)} className="text-slate-400 hover:text-red-500">
              <X size={14} />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
          {/* File Button */}
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors border border-slate-200"
            title="Upload Photo"
          >
            <ImageIcon size={20} />
          </button>
          
          {/* Hidden Input */}
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept="image/*"
            onChange={(e) => {
              if (e.target.files?.[0]) setSelectedFile(e.target.files[0])
            }}
          />

          {/* Text Input */}
          <div className="flex-1 relative">
            <textarea 
              className="w-full p-3 pr-10 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none shadow-sm transition-all resize-none h-[48px] max-h-[100px] py-3"
              placeholder="Type a note..."
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if(e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              disabled={isSubmitting}
            />
          </div>

          {/* Send Button */}
          <button 
            type="submit"
            disabled={(!newComment.trim() && !selectedFile) || isSubmitting}
            className="p-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:bg-slate-300 transition-colors shadow-sm"
          >
            {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </form>
      </div>
    </div>
  )
}