import { useState, useEffect, useMemo } from 'react';
import { useChat } from '../hooks/useChat';
import { fetchChatUsers } from '../api/chat';
import ChatMessageList from './ChatMessageList';
import ChatInput from './ChatInput';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [showMentions, setShowMentions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const {
    messages,
    unreadCount,
    mentionNotifications,
    sendMessage,
    loading,
    setUnreadCount,
    markMentionRead,
    clearMentions,
    jumpToMessage,
    scrollToId,
    setScrollToId,
    editMsg,
    deleteMsg
  } = useChat();

  const unreadMentions = mentionNotifications.filter(n => !n.read);

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m =>
      m.content.toLowerCase().includes(q) ||
      m.sender_username.toLowerCase().includes(q)
    );
  }, [messages, searchQuery]);

  useEffect(() => {
    if (isOpen) {
      fetchChatUsers()
        .then(data => { if (data) setUsers(data); })
        .catch(() => {});
    }
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setUnreadCount(0);
      setShowMentions(false);
      setSearchQuery('');
      setShowSearch(false);
    }
  };

  const handleSend = (data) => {
    if (replyTo) {
      data.reply_to_id = replyTo.id;
    }
    sendMessage(data);
    setReplyTo(null);
  };

  const handleMentionClick = (notif) => {
    markMentionRead(notif.id);
    setShowMentions(false);
    setTimeout(() => jumpToMessage(notif.message_id), 300);
  };

  return (
    <div className="chat-widget">
      <button className="chat-toggle-btn" onClick={handleOpen}>
        💬
        {unreadCount > 0 && !isOpen && (
          <span className="chat-badge">{unreadCount}</span>
        )}
        {unreadMentions.length > 0 && !isOpen && (
          <span className="chat-mention-badge">@{unreadMentions.length}</span>
        )}
      </button>

      {isOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-tabs">
              <button
                className={`chat-tab active`}
              >
                Общий
              </button>
              {unreadMentions.length > 0 && (
                <button
                  className="chat-tab chat-tab-mentions"
                  onClick={() => setShowMentions(!showMentions)}
                >
                  @{unreadMentions.length}
                </button>
              )}
              <button
                className={`chat-tab ${showSearch ? 'active' : ''}`}
                onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(''); }}
                title="Поиск"
              >
                🔍
              </button>
            </div>
            <button className="chat-close" onClick={() => setIsOpen(false)}>×</button>
          </div>

          {showSearch && (
            <div className="chat-search-bar">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по сообщениям..."
                className="chat-search-input"
                autoFocus
              />
              {searchQuery && (
                <span className="chat-search-count">{filteredMessages.length}</span>
              )}
              {searchQuery && (
                <button className="chat-search-clear" onClick={() => setSearchQuery('')}>✕</button>
              )}
            </div>
          )}

          {showMentions && (
            <div className="chat-mentions-list">
              {unreadMentions.map(notif => {
                const d = notif.created_at
                  ? new Date(notif.created_at.includes('T') && !notif.created_at.endsWith('Z') && !notif.created_at.includes('+') ? notif.created_at + 'Z' : notif.created_at)
                  : null;
                const now = new Date();
                const isToday = d && d.toDateString() === now.toDateString();
                const timeStr = d ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : '';
                const dateStr = d && !isToday ? d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' }) : '';
                return (
                  <div
                    key={notif.id}
                    className="chat-mentions-item"
                    onClick={() => handleMentionClick(notif)}
                  >
                    <div className="chat-mentions-left">
                      <span className="chat-mentions-sender">{notif.sender_username}</span>
                      <span className="chat-mentions-text">{notif.content}</span>
                    </div>
                    <span className="chat-mentions-time">
                      {dateStr && <>{dateStr} </>}
                      {timeStr}
                    </span>
                  </div>
                );
              })}
              {unreadMentions.length > 0 && (
                <div className="chat-mentions-clear" onClick={clearMentions}>
                  Отметить все как прочитанные
                </div>
              )}
            </div>
          )}

          {replyTo && (
            <div style={{ padding: '4px 10px', background: '#f0f4ff', borderBottom: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, flexShrink: 0 }}>
              <span>
                <strong>↩ {replyTo.sender_username}:</strong> {replyTo.content}
              </span>
              <span onClick={() => setReplyTo(null)} style={{ cursor: 'pointer', color: '#6b7280', padding: '0 4px' }}>✕</span>
            </div>
          )}

          <ChatMessageList
            messages={filteredMessages}
            loading={loading}
            onReply={(msg) => setReplyTo(msg)}
            scrollToId={scrollToId}
            onScrollToDone={() => setScrollToId(null)}
            onJumpTo={jumpToMessage}
            onEdit={editMsg}
            onDelete={deleteMsg}
          />

          <ChatInput
            onSend={handleSend}
            chatType="general"
            users={users}
          />
        </div>
      )}
    </div>
  );
}
