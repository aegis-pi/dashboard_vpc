import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getCurrentUser } from './auth/auth'
import { FleetPage } from './pages/FleetPage'
import { FactoryPage } from './pages/FactoryPage'
import { ReportsPage } from './pages/ReportsPage'
import { ChatPage } from './pages/ChatPage'
import { CloudInfraPage } from './pages/CloudInfraPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { LoginPage } from './pages/LoginPage'
import { CallbackPage } from './pages/CallbackPage'
import { ErrorBoundary } from './components/ErrorBoundary'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    getCurrentUser().then((u) => {
      setAuthed(u !== null)
      setChecked(true)
    })
  }, [])

  if (!checked) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg)',
      }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!authed) return <Navigate to="/login" replace />

  return <>{children}</>
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/callback" element={<CallbackPage />} />
          <Route path="/" element={<RequireAuth><FleetPage /></RequireAuth>} />
          <Route path="/factory/:factoryId" element={<RequireAuth><FactoryPage /></RequireAuth>} />
          <Route path="/cloud-infra" element={<RequireAuth><CloudInfraPage /></RequireAuth>} />
          <Route path="/admin/users" element={<RequireAuth><AdminUsersPage /></RequireAuth>} />
          <Route path="/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />
          <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
