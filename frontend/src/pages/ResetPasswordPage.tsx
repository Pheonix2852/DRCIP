import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../lib/api'
import { Card, CardHeader, CardDescription, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Button } from './ui/button'

type Step = 'request' | 'confirm'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const urlToken = searchParams.get('token') || ''
  const [step, setStep] = useState<Step>(urlToken ? 'confirm' : 'request')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState(urlToken)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const requestMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/v1/auth/password-reset/request', { email })
      return res.data
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'If the email exists, a reset link has been sent. Check your email for the token.' })
      setStep('confirm')
    },
    onError: () => {
      setFeedback({ type: 'success', message: 'If the email exists, a reset link has been sent. Check your email for the token.' })
      setStep('confirm')
    },
  })

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/v1/auth/password-reset/confirm', { token, password: newPassword })
      return res.data
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Password has been reset. You can now sign in.' })
    },
    onError: (err: Error) => {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setFeedback({ type: 'error', message: axiosErr.response?.data?.error?.message || err.message })
    },
  })

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)
    requestMutation.mutate()
  }

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)
    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', message: 'Passwords do not match.' })
      return
    }
    confirmMutation.mutate()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Reset Password</h1>
          <CardDescription>
            {step === 'request' ? 'Enter your email to receive a reset token.' : 'Enter the token from your email and your new password.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'request' ? (
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="reset-email" className="text-sm font-medium">Email</label>
                <Input id="reset-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={requestMutation.isPending} />
              </div>
              {feedback && (
                <div role="status" className={`text-sm p-2 rounded ${feedback.type === 'error' ? 'bg-status-error/10 text-status-error' : 'bg-status-success/10 text-status-success'}`}>
                  {feedback.message}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={requestMutation.isPending}>
                {requestMutation.isPending ? 'Sending...' : 'Send Reset Token'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="reset-token" className="text-sm font-medium">Reset Token</label>
                <Input id="reset-token" type="text" placeholder="Paste your reset token" value={token} onChange={(e) => setToken(e.target.value)} required disabled={confirmMutation.isPending} />
              </div>
              <div className="space-y-2">
                <label htmlFor="reset-new-pw" className="text-sm font-medium">New Password</label>
                <Input id="reset-new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} disabled={confirmMutation.isPending} />
                <p className="text-xs text-muted-foreground">Min 8 chars, uppercase, lowercase, digit.</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="reset-confirm-pw" className="text-sm font-medium">Confirm Password</label>
                <Input id="reset-confirm-pw" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={confirmMutation.isPending} />
              </div>
              {feedback && (
                <div role="status" className={`text-sm p-2 rounded ${feedback.type === 'error' ? 'bg-status-error/10 text-status-error' : 'bg-status-success/10 text-status-success'}`}>
                  {feedback.message}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={confirmMutation.isPending || !token || !newPassword || !confirmPassword}>
                {confirmMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </Button>
            </form>
          )}
          <div className="mt-4 text-center">
            <Link to="/login" className="text-sm text-muted-foreground hover:underline">Back to Sign In</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
