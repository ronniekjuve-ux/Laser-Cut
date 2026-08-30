import { useState, useMemo, useCallback } from 'react';
import { useChat } from '../hooks/useChat';
import ChatMessageList from './ChatMessageList';
import ChatInput from './ChatInput';

export default function ChatPage() {
  const {
    messages,
    sendMessage,
    loading,
    scrollToId,
    setScrollToId,
    jumpToMessage,
    editMsg,
    deleteMsg
  } = useChat();

  const [replyTo, setReplyTo] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m =>
      m.content.toLowerCase().includes(q) ||
      m.sender_username.toLowerCase().includes(q)
    );
  }, [messages, searchQuery]);

  const handleSend = (data) => {
    if (replyTo) {
      data.reply_to_id = replyTo.id;
    }
    sendMessage(data);
    setReplyTo(null);
  };

  return (
    <div className="chat-page">
      <div className="chat-page-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Общий чат</span>
        <div style={{ flex: 1 }} />
        <button
          className={`chat-tab ${showSearch ? 'active' : ''}`}
          onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(''); }}
          style={{ fontSize: 14 }}
        >
          🔍
        </button>
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

      {replyTo && (
        <div style={{ padding: '6px 12px', background: '#f0f4ff', borderBottom: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, flexShrink: 0 }}>
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
      />
    </div>
  );
}
