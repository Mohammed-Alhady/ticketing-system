import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function LoginPage() {
  const { signIn, user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!email || !password) {
      setError('البريد الإلكتروني وكلمة المرور مطلوبان.')
      return
    }
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page" dir="rtl">
      <form className="card login-card" onSubmit={onSubmit}>
        <h2>تسجيل الدخول</h2>
        <p>استخدم حساب Supabase Auth بالبريد وكلمة المرور.</p>
        {error && <div className="error">{error}</div>}
        <label>
          البريد الإلكتروني
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          كلمة المرور
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button disabled={loading}>{loading ? 'جاري الدخول...' : 'دخول'}</button>
      </form>
    </main>
  )
}
