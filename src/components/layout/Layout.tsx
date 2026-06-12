import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'

export function Layout() {
  return (
    <div className="app-shell" dir="rtl">
      <Sidebar />
      <main className="main">
        <Navbar />
        <Outlet />
      </main>
    </div>
  )
}
