"use client"
import { useState } from "react"
import { MessageSquarePlus, Send, X } from "lucide-react"
import { usePathname } from "next/navigation"

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState("")
  const [cat, setCat] = useState("general")
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const path = usePathname()

  const send = async () => {
    if (!msg.trim()) return
    setSending(true)
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, category: cat, page: path })
      })
      setSent(true)
      setMsg("")
      setTimeout(() => { setSent(false); setOpen(false) }, 2000)
    } catch (e) { console.error(e) }
    setSending(false)
  }

  return (
    <>
      <button onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 bg-green-600 hover:bg-green-700 text-white rounded-full p-3.5 shadow-lg transition-all hover:scale-105"
        title="Zgłoś uwagę">
        <MessageSquarePlus className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 z-50 bg-white rounded-xl shadow-2xl border w-80 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 text-sm">💬 Zgłoś uwagę / feedback</h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          {sent ? (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-green-600 font-medium">Dziękujemy za feedback!</p>
            </div>
          ) : (
            <>
              <select value={cat} onChange={e => setCat(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm mb-2">
                <option value="general">Ogólne</option>
                <option value="bug">Błąd / nie działa</option>
                <option value="ux">UX / nawigacja</option>
                <option value="krzywe">Krzywe zbiorów</option>
                <option value="dane">Dane / obliczenia</option>
                <option value="pomysl">Pomysł / sugestia</option>
              </select>
              <textarea value={msg} onChange={e => setMsg(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm h-24 resize-none"
                placeholder="Opisz co zauważyłeś, co nie działa lub co byś zmienił..." />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-gray-400">Strona: {path}</span>
                <button onClick={send} disabled={sending || !msg.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
                  {sending ? "..." : <><Send className="w-3.5 h-3.5" /> Wyślij</>}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
