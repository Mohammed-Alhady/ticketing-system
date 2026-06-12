import { useAuth } from '../../features/auth/AuthContext'

export function Navbar() {
  const { profile, signOut } = useAuth()
  return (
    <header className="navbar">
      <div>
        <strong>{profile?.full_name ?? 'مستخدم'}</strong>
        <div>{profile?.role === 'admin' ? 'مدير النظام' : 'موظف'}</div>
      </div>
      <button className="secondary" onClick={signOut}>
        تسجيل الخروج
      </button>
    </header>
  )
}
