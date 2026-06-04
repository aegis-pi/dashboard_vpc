import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2, UserCog } from 'lucide-react'
import { Shell } from '../components/Layout'
import { createAdminUser, deleteAdminUser, updateAdminUser } from '../api/client'
import type { AdminUser, FactoryAccessRole, GlobalRole, UserFactoryAccess } from '../api/types'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { useFactories } from '../hooks/useFactories'
import { adaptSidebarFactory } from '../adapters/factory'

const GLOBAL_ROLES: { value: GlobalRole; label: string }[] = [
  { value: 'super_admin', label: '본사 관리자' },
  { value: 'org_admin', label: '조직 관리자' },
  { value: 'factory_admin', label: '공장 관리자' },
  { value: 'viewer', label: '조회 전용' },
]

const FACTORY_ROLES: { value: FactoryAccessRole; label: string }[] = [
  { value: 'admin', label: '관리' },
  { value: 'viewer', label: '조회' },
]

interface FormState {
  id?: string
  email: string
  display_name: string
  global_role: GlobalRole
  factories: UserFactoryAccess[]
}

function emptyForm(): FormState {
  return {
    email: '',
    display_name: '',
    global_role: 'factory_admin',
    factories: [],
  }
}

function formFromUser(user: AdminUser): FormState {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    global_role: user.global_role,
    factories: user.factories,
  }
}

function roleLabel(role: GlobalRole): string {
  return GLOBAL_ROLES.find((item) => item.value === role)?.label ?? role
}

function accessSummary(user: AdminUser): string {
  if (user.global_role === 'super_admin' || user.global_role === 'org_admin') return '전체 공장'
  if (!user.factories.length) return '권한 없음'
  return user.factories.map((item) => `${item.factory_id}:${item.role}`).join(', ')
}

function upsertAccess(
  access: UserFactoryAccess[],
  factoryId: string,
  enabled: boolean,
  role: FactoryAccessRole = 'viewer',
): UserFactoryAccess[] {
  if (!enabled) return access.filter((item) => item.factory_id !== factoryId)
  if (access.some((item) => item.factory_id === factoryId)) return access
  return [...access, { factory_id: factoryId, role }]
}

function updateAccessRole(
  access: UserFactoryAccess[],
  factoryId: string,
  role: FactoryAccessRole,
): UserFactoryAccess[] {
  return access.map((item) => item.factory_id === factoryId ? { ...item, role } : item)
}

export function AdminUsersPage() {
  const users = useAdminUsers()
  const factories = useFactories()
  const [form, setForm] = useState<FormState>(() => emptyForm())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sidebarFactories = useMemo(() => (
    (factories.data?.factories ?? [])
      .map(adaptSidebarFactory)
      .sort((a, b) => a.factory_id.localeCompare(b.factory_id))
  ), [factories.data?.factories])

  const factoryIds = useMemo(() => (
    [...new Set((factories.data?.factories ?? []).map((item) => item.factory_id))]
      .sort((a, b) => a.localeCompare(b))
  ), [factories.data?.factories])

  useEffect(() => {
    if (form.global_role === 'super_admin' || form.global_role === 'org_admin') {
      setForm((current) => current.factories.length ? { ...current, factories: [] } : current)
    }
  }, [form.global_role])

  const selectedAccess = new Map(form.factories.map((item) => [item.factory_id, item.role]))
  const isGlobal = form.global_role === 'super_admin' || form.global_role === 'org_admin'

  async function submit() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        email: form.email,
        display_name: form.display_name,
        global_role: form.global_role,
        factories: isGlobal ? [] : form.factories,
      }
      if (form.id) {
        const updated = await updateAdminUser(form.id, payload)
        users.setData((current) => current.map((item) => item.id === updated.id ? updated : item))
        setForm(formFromUser(updated))
        setMessage('수정 완료')
      } else {
        const created = await createAdminUser(payload)
        users.setData((current) => [created, ...current].sort((a, b) => a.email.localeCompare(b.email)))
        setForm(formFromUser(created))
        setMessage('생성 완료')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove(user: AdminUser) {
    if (!window.confirm(`${user.display_name} 계정을 삭제할까요?`)) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await deleteAdminUser(user.id)
      users.setData((current) => current.map((item) => (
        item.id === user.id ? { ...item, status: 'disabled', factories: [] } : item
      )))
      if (form.id === user.id) setForm(emptyForm())
      setMessage('삭제 완료')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell
      factories={sidebarFactories}
      crumbs={[{ label: 'System' }, { label: '사용자 관리' }]}
      onRefresh={users.refresh}
    >
      <div className="admin-users-page">
        <div className="page-head compact">
          <div>
            <div className="eyebrow">Access Control</div>
            <h1>사용자 관리</h1>
          </div>
          <button className="btn" onClick={() => setForm(emptyForm())}>
            <Plus size={15} />
            신규
          </button>
        </div>

        {(message || error || users.error) && (
          <div className={`admin-users-alert ${error || users.error ? 'danger' : 'normal'}`}>
            {error ?? users.error?.message ?? message}
          </div>
        )}

        <div className="admin-users-grid">
          <section className="card admin-users-table-card">
            <div className="card-hd">
              <div>
                <div className="eyebrow">Users</div>
                <h2>계정 목록</h2>
              </div>
              <span className="mono tnum">{users.data.length}</span>
            </div>
            <div className="table-wrap">
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>사용자</th>
                    <th>역할</th>
                    <th>공장 권한</th>
                    <th>상태</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.loading && (
                    <tr><td colSpan={5}>불러오는 중</td></tr>
                  )}
                  {!users.loading && users.data.map((user) => (
                    <tr key={user.id} className={form.id === user.id ? 'selected' : ''}>
                      <td>
                        <button className="link-button" onClick={() => setForm(formFromUser(user))}>
                          <span>{user.display_name}</span>
                          <span className="mono">{user.email}</span>
                        </button>
                      </td>
                      <td>{roleLabel(user.global_role)}</td>
                      <td className="mono">{accessSummary(user)}</td>
                      <td>
                        <span className={`status-chip ${user.status}`}>{user.status}</span>
                      </td>
                      <td>
                        <button className="icon-btn danger" onClick={() => { void remove(user) }} disabled={saving}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card admin-users-editor">
            <div className="card-hd">
              <div>
                <div className="eyebrow">Editor</div>
                <h2>{form.id ? '권한 수정' : '사용자 생성'}</h2>
              </div>
              <UserCog size={18} />
            </div>

            <div className="admin-form">
              <label>
                <span>이메일</span>
                <input
                  value={form.email}
                  onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                  disabled={Boolean(form.id)}
                />
              </label>
              <label>
                <span>이름</span>
                <input
                  value={form.display_name}
                  onChange={(e) => setForm((current) => ({ ...current, display_name: e.target.value }))}
                />
              </label>
              <label>
                <span>역할</span>
                <select
                  value={form.global_role}
                  onChange={(e) => setForm((current) => ({ ...current, global_role: e.target.value as GlobalRole }))}
                >
                  {GLOBAL_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </label>

              <div className={`factory-access-panel ${isGlobal ? 'muted' : ''}`}>
                <div className="factory-access-head">
                  <span>공장 권한</span>
                  <span className="mono">{isGlobal ? 'ALL' : `${form.factories.length}/${factoryIds.length}`}</span>
                </div>
                {isGlobal ? (
                  <div className="factory-access-global">전체 공장 접근</div>
                ) : (
                  factoryIds.map((factoryId) => {
                    const enabled = selectedAccess.has(factoryId)
                    const role = selectedAccess.get(factoryId) ?? 'viewer'
                    return (
                      <div className="factory-access-row" key={factoryId}>
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => setForm((current) => ({
                              ...current,
                              factories: upsertAccess(current.factories, factoryId, e.target.checked),
                            }))}
                          />
                          <span className="mono">{factoryId}</span>
                        </label>
                        <select
                          value={role}
                          disabled={!enabled}
                          onChange={(e) => setForm((current) => ({
                            ...current,
                            factories: updateAccessRole(current.factories, factoryId, e.target.value as FactoryAccessRole),
                          }))}
                        >
                          {FACTORY_ROLES.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })
                )}
              </div>

              <button className="btn primary" onClick={() => { void submit() }} disabled={saving || !form.email || !form.display_name}>
                <Save size={15} />
                저장
              </button>
            </div>
          </section>
        </div>
      </div>
    </Shell>
  )
}
