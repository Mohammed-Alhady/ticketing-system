import { NavLink } from 'react-router-dom'
import { isAdmin } from '../../lib/permissions'
import { useAuth } from '../../features/auth/AuthContext'

const links = [
  ['لوحة التحكم', '/dashboard'],
  ['العملاء', '/customers'],
  ['الموردون', '/suppliers'],
  ['الخدمات', '/services'],
  ['المعاملات', '/transactions'],
  ['حسابات العملاء', '/customer-accounts'],
  ['حسابات الموردين', '/supplier-accounts'],
  ['التقارير', '/reports'],
]

export function Sidebar() {
  const { profile } = useAuth()
  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>نظام خدمات السفر</h1>
        <p>تذاكر، تأشيرات، فنادق وخدمات</p>
      </div>
      <nav>
        {links.map(([label, to]) => (
          <NavLink className="nav-link" key={to} to={to}>
            {label}
          </NavLink>
        ))}
        {isAdmin(profile) && (
          <NavLink className="nav-link" to="/users">
            المستخدمون
          </NavLink>
        )}
      </nav>
      <small>الصلاحية: {profile?.role === 'admin' ? 'مدير' : 'موظف'}</small>
    </aside>
  )
}
