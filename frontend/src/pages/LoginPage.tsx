import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .authStatus()
      .then((status) => {
        if (cancelled) return
        if (!status.required || status.authenticated) {
          navigate('/', { replace: true })
        } else {
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.verifyInvite(code)
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname
      navigate(from || '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="login-muted">加载中…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">WJ Video Studio</h1>
        <p className="login-muted">请输入邀请码以继续访问</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="label" htmlFor="invite-code">
            邀请码
          </label>
          <input
            id="invite-code"
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoFocus
            disabled={submitting}
          />
          {error ? <p className="login-error">{error}</p> : null}
          <button className="btn btn-primary login-submit" type="submit" disabled={submitting || !code.trim()}>
            {submitting ? '验证中…' : '进入'}
          </button>
        </form>
      </div>
    </div>
  )
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')

  useEffect(() => {
    let cancelled = false
    api
      .authStatus()
      .then((status) => {
        if (cancelled) return
        if (!status.required || status.authenticated) setState('ok')
        else setState('denied')
      })
      .catch(() => {
        if (!cancelled) setState('denied')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'loading') {
    return (
      <div className="login-page">
        <div className="login-card">
          <p className="login-muted">加载中…</p>
        </div>
      </div>
    )
  }

  if (state === 'denied') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
