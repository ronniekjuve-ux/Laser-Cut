import { useState, useEffect, useRef } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function ItemNotesChat({ itemType, itemId, onClose }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchNotes();
  }, [itemType, itemId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [notes]);

  const fetchNotes = async () => {
    try {
      const res = await client.get(`/api/v1/warehouse/notes/${itemType}/${itemId}`);
      setNotes(res.data || []);
    } catch (err) {
      console.error('Failed to load notes', err);
    } finally {
      setLoading(false);
    }
  };

  const sendNote = async () => {
    if (!newText.trim()) return;
    setSending(true);
    try {
      const res = await client.post(`/api/v1/warehouse/notes/${itemType}/${itemId}`, { text: newText.trim() });
      setNotes(prev => [res.data, ...prev]);
      setNewText('');
    } catch (err) {
      alert('Ошибка отправки');
    } finally {
      setSending(false);
    }
  };

  const deleteNote = async (noteId) => {
    if (!confirm('Удалить сообщение?')) return;
    try {
      await client.delete(`/api/v1/warehouse/notes/${itemType}/${itemId}/${noteId}`);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, top: '30%',
          background: '#fff', borderRadius: '16px 16px 0 0',
          display: 'flex', flexDirection: 'column', zIndex: 1100,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderRadius: '16px 16px 0 0', background: '#f8fafc',
        }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Примечания</span>
          <button className="close-btn" onClick={onClose} style={{ fontSize: 20 }}>✕</button>
        </div>

        {/* Notes list */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Загрузка...</div>
          ) : notes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Нет примечаний</div>
          ) : (
            notes.map(note => (
              <div
                key={note.id}
                style={{
                  background: note.user_id === user?.id ? '#eff6ff' : '#f8fafc',
                  border: '1px solid ' + (note.user_id === user?.id ? '#bfdbfe' : '#e2e8f0'),
                  borderRadius: 8, padding: '8px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 12, color: '#1d4ed8' }}>{note.username}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{formatTime(note.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: '#334155', wordBreak: 'break-word' }}>{note.text}</div>
                {isAdmin && (
                  <div style={{ marginTop: 4 }}>
                    <button
                      onClick={() => deleteNote(note.id)}
                      style={{
                        background: 'none', border: 'none', color: '#ef4444', fontSize: 11,
                        cursor: 'pointer', padding: 0,
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #e2e8f0',
          display: 'flex', gap: 8, background: '#f8fafc',
        }}>
          <input
            type="text"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendNote()}
            placeholder="Введите примечание..."
            style={{
              flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0',
              borderRadius: 8, fontSize: 13,
            }}
            disabled={sending}
          />
          <button
            className="btn btn-primary"
            onClick={sendNote}
            disabled={!newText.trim() || sending}
            style={{ borderRadius: 8, padding: '8px 16px' }}
          >
            {sending ? '...' : '→'}
          </button>
        </div>
      </div>
    </div>
  );
}
