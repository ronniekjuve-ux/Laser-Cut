import { useState } from 'react';
import { useChat } from '../hooks/useChat';
import ChatMessageList from './ChatMessageList';
import ChatInput from './ChatInput';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    messages,
    unreadCount,
    sendMessage,
    activeTab,
    setActiveTab,
    loading,
    setUnreadCount
  } = useChat();

  const handleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setUnreadCount(0);
    }
  };

  return (
    <div className="chat-widget">
      {/* Chat Toggle Button */}
      <button className="chat-toggle-btn" onClick={handleOpen}>
        💬
        {unreadCount > 0 && (
          <span className="chat-badge">{unreadCount}</span>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-tabs">
              <button
                className={`chat-tab ${activeTab === 'general' ? 'active' : ''}`}
                onClick={() => setActiveTab('general')}
              >
                Общий
              </button>
              <button
                className={`chat-tab ${activeTab === 'personal' ? 'active' : ''}`}
                onClick={() => setActiveTab('personal')}
              >
                Личные
              </button>
            </div>
            <button className="chat-close" onClick={() => setIsOpen(false)}>×</button>
          </div>

          <ChatMessageList messages={messages} loading={loading} />

          <ChatInput
            onSend={sendMessage}
            chatType={activeTab}
          />
        </div>
      )}
    </div>
  );
}
