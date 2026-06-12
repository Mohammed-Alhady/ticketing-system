import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">جاري التحميل...</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
