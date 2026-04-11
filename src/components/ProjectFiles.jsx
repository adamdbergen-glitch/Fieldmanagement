import React, { useState, useRef } from 'react' // NEW: Added useRef
import { supabase } from '../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Image as ImageIcon, Trash2, Upload, Paperclip, Eye, UploadCloud, Loader2 } from 'lucide-react' // NEW: Added UploadCloud and Loader2
import { useAuth } from '../contexts/AuthContext'

export default function ProjectFiles({ projectId }) {
  const { userProfile } = useAuth()
  const queryClient = useQueryClient()
  const [isUploading, setIsUploading] = useState(false)
  
  // NEW: Ref to trigger the file input from our empty state button
  const fileInputRef = useRef(null)

  // Fetch Files
  const { data: files } = useQuery({
    queryKey: ['project_files', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  // Handle Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      setIsUploading(true)
      
      // 1. Upload to Storage Bucket
      const fileExt = file.name.split('.').pop()
      const filePath = `${projectId}/${Date.now()}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('project-files')
        .getPublicUrl(filePath)

      // 3. Save Record to Database
      await supabase.from('project_files').insert({
        project_id: projectId,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type.includes('image') ? 'image' : 'document',
        uploaded_by: userProfile.id
      })

      queryClient.invalidateQueries(['project_files', projectId])
    } catch (error) {
      alert('Upload failed: ' + error.message)
    } finally {
      setIsUploading(false)
      // NEW: Clear the input so the same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Handle Delete
  const handleDelete = async (id, fileName) => {
    if (!confirm('Delete this file?')) return
    await supabase.from('project_files').delete().eq('id', id)
    queryClient.invalidateQueries(['project_files', projectId])
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-900 flex items-center gap-2">
          <Paperclip size={18} className="text-amber-500" /> 
          Blueprints & Site Photos
        </h3>
        
        <label className={`cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload size={14} />
          {isUploading ? 'Uploading...' : 'Upload File'}
          {/* NEW: Attached the fileInputRef here */}
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" />
        </label>
      </div>

      <div className="space-y-2">
        {/* NEW: Upgraded Empty State with Call to Action */}
        {files?.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
            <div className="w-12 h-12 bg-white shadow-sm border border-slate-100 rounded-full flex items-center justify-center mb-4">
              <UploadCloud size={24} className="text-slate-400" />
            </div>
            <h4 className="text-sm font-bold text-slate-700 mb-2">No Files Uploaded</h4>
            <p className="text-xs text-slate-500 max-w-[250px] mb-5 leading-relaxed">
              Keep all your project blueprints, permits, and site photos in one organized place.
            </p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-300 text-xs font-bold py-2.5 px-5 rounded-lg transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {isUploading ? 'Uploading...' : 'Upload First File'}
            </button>
          </div>
        )}

        {files?.map(file => (
          <div key={file.id} className="group flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:border-amber-200 hover:bg-amber-50/30 transition-all bg-white">
            <a href={file.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0 text-slate-400">
                {file.file_type === 'image' ? <ImageIcon size={20} /> : <FileText size={20} />}
              </div>
              <div className="truncate">
                <p className="text-sm font-bold text-slate-700 truncate group-hover:text-amber-700">{file.name}</p>
                <p className="text-xs text-slate-400">
                   {new Date(file.created_at).toLocaleDateString()}
                </p>
              </div>
            </a>
            
            <div className="flex items-center gap-2">
              <a href={file.file_url} target="_blank" rel="noreferrer" className="p-2 text-slate-300 hover:text-slate-600">
                <Eye size={16} />
              </a>
              <button onClick={() => handleDelete(file.id, file.file_name)} className="p-2 text-slate-300 hover:text-red-500">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
