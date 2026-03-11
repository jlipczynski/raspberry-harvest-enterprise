"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Shield, UserPlus, Users, Building2, Pencil, Trash2, RefreshCw, X, Save, Key } from "lucide-react"

interface UserData {
  id: string; email: string; name: string; role: string
  tenantId?: string; tenant?: { id: string; name: string }; createdAt: string
}

interface FeedbackItem {
  id: string; category: string; userName: string; userEmail: string
  createdAt: string; message: string; page?: string
}

interface SessionUser {
  role?: string; userId?: string
}

export default function AdminPage() {
  const { data: session } = useSession()
  const role = (session?.user as SessionUser | undefined)?.role
  const userId = (session?.user as SessionUser | undefined)?.userId
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<UserData | null>(null)
  const [form, setForm] = useState({ email: "", password: "", name: "", farmName: "", role: "MANAGER" })
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'users'|'feedback'>('users')
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [fbLoading, setFbLoading] = useState(false)

  const loadFeedback = async () => {
    setFbLoading(true)
    try {
      const res = await fetch("/api/feedback")
      if (res.ok) { const d = await res.json(); setFeedbacks(d.feedback || []) }
    } catch (e) { console.error(e) }
    setFbLoading(false)
  }

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/users")
      if (res.ok) { const data = await res.json(); setUsers(data.users) }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => {
    const load = async () => { await loadUsers() }
    load()
  }, [])

  const resetForm = () => {
    setForm({ email: "", password: "", name: "", farmName: "", role: "MANAGER" })
    setEditingUser(null)
    setShowForm(false)
  }

  const startEdit = (u: UserData) => {
    setEditingUser(u)
    setForm({ email: u.email, password: "", name: u.name || "", farmName: u.tenant?.name || "", role: u.role })
    setShowForm(true)
  }

  const saveUser = async () => {
    if (!form.name || !form.email) { alert("Wypełnij imię i email"); return }
    if (!editingUser && !form.password) { alert("Podaj hasło"); return }
    if (!form.farmName) { alert("Podaj nazwę gospodarstwa"); return }
    setSaving(true)
    try {
      const method = editingUser ? "PUT" : "POST"
      const body = editingUser
        ? { id: editingUser.id, ...form, password: form.password || undefined }
        : form
      const res = await fetch("/api/admin/users", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      })
      if (res.ok) { resetForm(); loadUsers() }
      else { const err = await res.json(); alert("Błąd: " + err.error) }
    } catch (e) { alert("Błąd: " + e) }
    setSaving(false)
  }

  const deleteUser = async (u: UserData) => {
    if (u.id === userId) { alert("Nie możesz usunąć siebie"); return }
    if (!confirm("Usunąć użytkownika " + u.name + " (" + u.email + ")?")) return
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id })
      })
      if (res.ok) loadUsers()
      else { const err = await res.json(); alert("Błąd: " + err.error) }
    } catch (e) { alert("Błąd: " + e) }
  }

  if (role !== "SUPER_ADMIN") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-600">Brak dostępu</h2>
          <p className="text-gray-400 mt-2">Ta strona jest dostępna tylko dla Super Admina</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <Shield className="w-7 h-7 text-amber-500" /> Admin Panel
          </h1>
          <p className="text-gray-500 mt-1">Zarządzanie gospodarstwami i użytkownikami</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadUsers} disabled={loading}>
            <RefreshCw className={"w-4 h-4 mr-2 " + (loading ? "animate-spin" : "")} /> Odśwież
          </Button>
          <Button onClick={() => { resetForm(); setShowForm(true) }} className="bg-green-600 hover:bg-green-700">
            <UserPlus className="w-4 h-4 mr-2" /> Nowe konto
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('users')} className={"px-4 py-2 rounded-lg text-sm font-medium " + (tab === 'users' ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
          <Users className="w-4 h-4 inline mr-1.5" />Użytkownicy
        </button>
        <button onClick={() => { setTab('feedback'); loadFeedback() }} className={"px-4 py-2 rounded-lg text-sm font-medium " + (tab === 'feedback' ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
          💬 Feedback {feedbacks.length > 0 && <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{feedbacks.length}</span>}
        </button>
      </div>

      {tab === 'feedback' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700">Feedback od testerów</h3>
            <button onClick={loadFeedback} className="text-sm text-gray-500 hover:text-gray-700">🔄 Odśwież</button>
          </div>
          {fbLoading ? <p className="text-center py-8 text-gray-400">Ładowanie...</p> : feedbacks.length === 0 ? <p className="text-center py-8 text-gray-400">Brak feedbacku</p> : (
            <div className="divide-y">
              {feedbacks.map((fb: FeedbackItem) => (
                <div key={fb.id} className="px-6 py-4">
                  <div className="flex items-center gap-3 mb-1">
                    <span className={"text-xs px-2 py-0.5 rounded-full " + (
                      fb.category === 'bug' ? "bg-red-100 text-red-700" :
                      fb.category === 'ux' ? "bg-blue-100 text-blue-700" :
                      fb.category === 'krzywe' ? "bg-orange-100 text-orange-700" :
                      fb.category === 'dane' ? "bg-purple-100 text-purple-700" :
                      fb.category === 'pomysl' ? "bg-green-100 text-green-700" :
                      "bg-gray-100 text-gray-700"
                    )}>{fb.category}</span>
                    <span className="text-sm font-medium text-gray-800">{fb.userName}</span>
                    <span className="text-xs text-gray-400">{fb.userEmail}</span>
                    <span className="text-xs text-gray-400 ml-auto">{new Date(fb.createdAt).toLocaleString("pl-PL")}</span>
                  </div>
                  <p className="text-sm text-gray-700">{fb.message}</p>
                  {fb.page && <span className="text-[10px] text-gray-400">Strona: {fb.page}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'users' && <>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div><p className="text-2xl font-bold">{users.length}</p><p className="text-xs text-gray-500">Użytkowników</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-green-600" />
            </div>
            <div><p className="text-2xl font-bold">{new Set(users.map(u => u.tenant?.name)).size}</p><p className="text-xs text-gray-500">Gospodarstw</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-600" />
            </div>
            <div><p className="text-2xl font-bold">{users.filter(u => u.role === "SUPER_ADMIN").length}</p><p className="text-xs text-gray-500">Adminów</p></div>
          </div>
        </div>
      </div>

      {/* Form - create or edit */}
      {showForm && (
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              {editingUser ? <Pencil className="w-5 h-5 text-blue-600" /> : <UserPlus className="w-5 h-5 text-green-600" />}
              {editingUser ? "Edytuj: " + editingUser.name : "Utwórz nowe konto"}
            </h3>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Imię i nazwisko</label>
              <input className="w-full border rounded-lg px-3 py-2.5" placeholder="Jan Kowalski"
                value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
              <input type="email" className="w-full border rounded-lg px-3 py-2.5" placeholder="jan@firma.pl"
                value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                {editingUser ? "Nowe hasło (puste = bez zmian)" : "Hasło"}
              </label>
              <div className="relative">
                <input type="text" className="w-full border rounded-lg px-3 py-2.5 pr-8" placeholder={editingUser ? "pozostaw puste..." : "min. 8 znaków"}
                  value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                <Key className="w-4 h-4 text-gray-300 absolute right-3 top-3" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Nazwa gospodarstwa</label>
              <input className="w-full border rounded-lg px-3 py-2.5" placeholder="Gospodarstwo Rolne XYZ"
                value={form.farmName} onChange={e => setForm({...form, farmName: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Rola</label>
              <select className="w-full border rounded-lg px-3 py-2.5"
                value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                <option value="MANAGER">Zarządca</option>
                <option value="RECRUITER">Rekruter</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={saveUser} disabled={saving} className="bg-green-600 hover:bg-green-700">
              {saving ? "Zapisywanie..." : editingUser ? "Zapisz zmiany" : "Utwórz konto"}
              {!saving && (editingUser ? <Save className="w-4 h-4 ml-2" /> : <UserPlus className="w-4 h-4 ml-2" />)}
            </Button>
            <Button variant="outline" onClick={resetForm}>Anuluj</Button>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-700">Użytkownicy i gospodarstwa</h3>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-6 py-3">Użytkownik</th>
              <th className="text-left px-6 py-3">Gospodarstwo</th>
              <th className="text-left px-6 py-3">Rola</th>
              <th className="text-left px-6 py-3">Utworzony</th>
              <th className="text-right px-6 py-3">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Ładowanie...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Brak użytkowników</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-800">{u.name || "—"}</div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <Building2 className="w-3.5 h-3.5 text-green-500" />
                    {u.tenant?.name || "—"}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={"px-2.5 py-1 rounded-full text-xs font-medium " + (
                    u.role === "SUPER_ADMIN" ? "bg-amber-100 text-amber-700" : u.role === "RECRUITER" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                  )}>
                    {u.role === "SUPER_ADMIN" ? "Super Admin" : u.role === "RECRUITER" ? "Rekruter" : "Zarządca"}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(u.createdAt).toLocaleDateString("pl-PL")}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => startEdit(u)} className="text-gray-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50" title="Edytuj">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {u.id !== userId && (
                      <button onClick={() => deleteUser(u)} className="text-gray-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50" title="Usuń">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>}
    </div>
  )
}
