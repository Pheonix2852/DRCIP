import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../lib/api'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Button } from './ui/button'

interface UserProfile {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

export function ProfilePage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwFeedback, setPwFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: UserProfile }>('/api/v1/me')
      return res.data.data
    },
  })

  const passwordMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/v1/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      return res.data
    },
    onSuccess: () => {
      setPwFeedback({ type: 'success', message: 'Password changed successfully.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err: Error) => {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setPwFeedback({ type: 'error', message: axiosErr.response?.data?.error?.message || err.message })
    },
  })

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault()
    setPwFeedback(null)
    if (newPassword !== confirmPassword) {
      setPwFeedback({ type: 'error', message: 'Passwords do not match.' })
      return
    }
    passwordMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Profile</h1>
        <div className="text-center py-16 text-muted-foreground" role="status">Loading profile...</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{profile.name}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{profile.email}</dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-medium">{profile.role}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">{profile.is_active ? 'Active' : 'Inactive'}</dd>
              <dt className="text-muted-foreground">Member Since</dt>
              <dd className="font-medium">{new Date(profile.created_at).toLocaleDateString()}</dd>
              {profile.last_login_at && (
                <>
                  <dt className="text-muted-foreground">Last Login</dt>
                  <dd className="font-medium">{new Date(profile.last_login_at).toLocaleString()}</dd>
                </>
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <label htmlFor="current-pw" className="text-sm font-medium">Current Password</label>
              <Input id="current-pw" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="new-pw" className="text-sm font-medium">New Password</label>
              <Input id="new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
              <p className="text-xs text-muted-foreground mt-1">Min 8 chars, uppercase, lowercase, digit.</p>
            </div>
            <div>
              <label htmlFor="confirm-pw" className="text-sm font-medium">Confirm New Password</label>
              <Input id="confirm-pw" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            {pwFeedback && (
              <div
                role="status"
                className={`text-sm p-2 rounded ${pwFeedback.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}
              >
                {pwFeedback.message}
              </div>
            )}
            <Button type="submit" disabled={passwordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}>
              {passwordMutation.isPending ? 'Changing...' : 'Change Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
