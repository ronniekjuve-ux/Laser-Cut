import { useChat } from '../hooks/useChat';
import ChatMessageList from './ChatMessageList';
import ChatInput from './ChatInput';

export default function ChatPage() {
  const {
    messages,
    unreadCount,
    sendMessage,
    activeTab,
    setActiveTab,
    loading
  } = useChat();

  return (
    <div className="chat-page">
      <div className="chat-page-header">
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
      </div>

      <ChatMessageList messages={messages} loading={loading} />

      <ChatInput
        onSend={sendMessage}
        chatType={activeTab}
      />
    </div>
  );
}
