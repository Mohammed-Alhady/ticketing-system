import { Navigate, Outlet } from 'react-router-dom'
import { isAdmin } from '../../lib/permissions'
import { useAuth } from '../../features/auth/AuthContext'

export function AdminRoute() {
  const { profile, loading } = useAuth()
  if (loading) return <div className="loading">جاري التحميل...</div>
  if (!isAdmin(profile)) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
