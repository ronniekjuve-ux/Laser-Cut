import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

function highlightMentions(text) {
  return text.replace(/@(\w+)/g, '<span class="chat-mention">@$1</span>');
}

export default function ChatMessageList({ messages, loading, onReply, scrollToId, onScrollToDone, onJumpTo, onEdit, onDelete }) {
  const { user } = useAuth();
  const listRef = useRef(null);
  const prevScrollToId = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (scrollToId && listRef.current && prevScrollToId.current !== scrollToId) {
      prevScrollToId.current = scrollToId;
      const el = listRef.current.querySelector(`[data-msg-id="${scrollToId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('chat-message-highlight');
        setTimeout(() => el.classList.remove('chat-message-highlight'), 2000);
        if (onScrollToDone) onScrollToDone();
      }
    }
  }, [scrollToId, messages, onScrollToDone]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setShowScrollBtn(!atBottom);
  };

  const scrollToBottom = () => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  };

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setEditText(msg.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEdit = async () => {
    if (!editText.trim() || !editingId) return;
    try {
      await onEdit(editingId, editText.trim());
      setEditingId(null);
      setEditText('');
    } catch (err) {
      console.error('Edit failed:', err);
    }
  };

  const handleDelete = async (msg) => {
    if (!confirm('Удалить сообщение?')) return;
    try {
      await onDelete(msg.id);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  if (loading) {
    return <div className="chat-loading">Загрузка...</div>;
  }

  return (
    <div className="chat-messages" ref={listRef} onScroll={handleScroll}>
      {messages.length === 0 ? (
        <div className="chat-empty">Нет сообщений</div>
      ) : (
        messages.map((msg) => {
          const isOwn = msg.sender_id === user?.id;
          const recipientName = msg.chat_username || null;
          const replyToMsg = msg.reply_to_message || null;

          return (
            <div
              key={msg.id}
              data-msg-id={msg.id}
              className={`chat-message ${isOwn ? 'own' : ''} ${msg.is_deleted ? 'deleted' : ''}`}
            >
              {!msg.is_deleted ? (
                <>
                  <div className="chat-message-header">
                    <span className="chat-sender">{msg.sender_username}</span>
                    {msg.chat_type === 'personal' && recipientName && (
                      <span className="chat-recipient">
                        → {isOwn ? recipientName : msg.sender_username}
                      </span>
                    )}
                    <span className="chat-time">
                      {(() => {
                        const d = new Date(msg.created_at.includes('T') && !msg.created_at.endsWith('Z') && !msg.created_at.includes('+') ? msg.created_at + 'Z' : msg.created_at);
                        return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
                      })()}
                      {msg.is_edited && <span className="chat-edited"> (ред.)</span>}
                    </span>
                    {isOwn && (
                      <div className="chat-msg-actions">
                        <button className="chat-msg-action" onClick={() => startEdit(msg)} title="Редактировать">✎</button>
                        <button className="chat-msg-action chat-msg-action-delete" onClick={() => handleDelete(msg)} title="Удалить">✕</button>
                      </div>
                    )}
                  </div>
                  {replyToMsg && (
                    <div
                      className="chat-reply-quote"
                      onClick={() => onJumpTo && onJumpTo(msg.reply_to_id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="chat-reply-sender">↩ {replyToMsg.sender_username}</div>
                      <div className="chat-reply-text">{replyToMsg.content}</div>
                    </div>
                  )}
                  {editingId === msg.id ? (
                    <div className="chat-edit-form">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="chat-edit-input"
                        autoFocus
                      />
                      <button className="chat-edit-save" onClick={saveEdit}>✓</button>
                      <button className="chat-edit-cancel" onClick={cancelEdit}>✕</button>
                    </div>
                  ) : (
                    <div className="chat-message-body">
                      <div
                        className="chat-message-content"
                        dangerouslySetInnerHTML={{ __html: highlightMentions(msg.content) }}
                      />
                      {onReply && (
                        <button className="chat-reply-btn" onClick={() => onReply(msg)} title="Ответить">↩</button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="chat-message-deleted">
                  <span className="chat-deleted-text">сообщение удалено</span>
                </div>
              )}
            </div>
          );
        })
      )}

      {showScrollBtn && (
        <button className="chat-scroll-bottom" onClick={scrollToBottom} title="К последнему сообщению">
          ↓
        </button>
      )}
    </div>
  );
}
