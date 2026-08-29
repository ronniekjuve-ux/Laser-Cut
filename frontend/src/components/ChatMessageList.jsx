import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

function highlightMentions(text) {
  return text.replace(/@(\w+)/g, '<span class="chat-mention">@$1</span>');
}

export default function ChatMessageList({ messages, loading }) {
  const { user } = useAuth();
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  if (loading) {
    return <div className="chat-loading">Загрузка...</div>;
  }

  return (
    <div className="chat-messages" ref={listRef}>
      {messages.length === 0 ? (
        <div className="chat-empty">Нет сообщений</div>
      ) : (
        messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-message ${msg.sender_id === user?.id ? 'own' : ''}`}
          >
            <div className="chat-message-header">
              <span className="chat-sender">{msg.sender_username}</span>
              <span className="chat-time">
                {new Date(msg.created_at).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
            <div
              className="chat-message-content"
              dangerouslySetInnerHTML={{ __html: highlightMentions(msg.content) }}
            />
          </div>
        ))
      )}
    </div>
  );
}
