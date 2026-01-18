import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // 2. Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else {
        setUserProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    // FIX: Changed from 'employees' to 'profiles'
    // This is where we saved your 'admin' role
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (error) {
      console.log("Profile fetch error, defaulting to crew:", error.message)
    }

    // If data exists, use it. Otherwise default to crew.
    setUserProfile(data || { role: 'crew' }) 
    setLoading(false)
  }

  const signIn = async (email, password) => {
    const result = await supabase.auth.signInWithPassword({ email, password })
    return result
  }

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ 
      session, 
      userProfile, 
      loading,
      isAdmin: userProfile?.role === 'admin',
      signIn,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  )
}