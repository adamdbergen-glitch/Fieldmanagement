import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout' 
import Login from './pages/login'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Customers from './pages/Customers'
import NewProject from './pages/NewProject'
import ProjectDetails from './pages/ProjectDetails'
import SOPs from './pages/SOPs'
import SOPEditor from './pages/SOPEditor'
import Calendar from './pages/Calendar'
import Team from './pages/Team'
import Timesheets from './pages/Timesheets'
import CustomerPortal from './pages/CustomerPortal'
import Calculator from './pages/Calculator' 
import Financials from './pages/Financials'
import InternalEstimator from './pages/InternalEstimator' // <--- 1. NEW IMPORT

// Create the client for data fetching
const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/portal/:token" element={<CustomerPortal />} />
            
            <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/new" element={<NewProject />} />
              <Route path="/projects/:id" element={<ProjectDetails />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/customers" element={<Customers />} />
              
              {/* SOP ROUTES */}
              <Route path="/sops" element={<SOPs />} />
              <Route path="/sops/new" element={<SOPEditor />} />
              <Route path="/sops/:id" element={<SOPEditor />} />

              {/* TEAM & TIME ROUTES */}
              <Route path="/team" element={<Team />} />
              <Route path="/timesheets" element={<Timesheets />} />
              
              {/* TOOLS */}
              <Route path="/calculator" element={<Calculator />} />
              <Route path="/estimator" element={<InternalEstimator />} /> {/* <--- 2. NEW ROUTE */}
              
              {/* ADMIN FINANCIALS */}
              <Route path="/financials" element={<Financials />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function PrivateRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400">Loading...</div>
  if (!session) return <Navigate to="/login" />
  return children
}
