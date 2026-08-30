import { useState, useRef } from 'react';
import { fetchChatUsers } from '../api/chat';

const EMOJI_LIST = ['👍', '👎', '❤️', '🔥', '😊', '😂', '🤔', '👏', '✅', '❌', '👋', '🎉', '💪', '🙏', '👀', '🥴'];

export default function ChatInput({ onSend, chatType = 'general', users: usersProp = [], selectedRecipient, showAtBtn = true }) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionUsers, setMentionUsers] = useState([]);
  const [selectedMentionIds, setSelectedMentionIds] = useState([]);
  const inputRef = useRef(null);

  const users = usersProp.length > 0 ? usersProp : [];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (chatType === 'personal' && !selectedRecipient) return;

    const data = {
      chat_type: chatType,
      content: text.trim(),
    };

    if (chatType === 'personal' && selectedRecipient) {
      data.chat_id = selectedRecipient.id;
    }

    if (selectedMentionIds.length > 0) {
      data.mention_ids = selectedMentionIds;
    }

    onSend(data);
    setText('');
    setShowEmoji(false);
    setShowMentions(false);
    setSelectedMentionIds([]);
  };

  const handleAtBtn = async () => {
    setShowEmoji(false);
    if (showMentions) {
      setShowMentions(false);
      return;
    }
    let list = users;
    if (list.length === 0) {
      try { list = await fetchChatUsers(); } catch (e) { return; }
    }
    setMentionUsers(list);
    setShowMentions(true);
  };

  const handleMentionSelect = (user) => {
    setText(prev => {
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed} @${user.username} ` : `@${user.username} `;
    });
    setSelectedMentionIds(prev => prev.includes(user.id) ? prev : [...prev, user.id]);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleEmojiSelect = (emoji) => {
    setText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const canSend = text.trim() && (chatType === 'general' || selectedRecipient);

  return (
    <div className="chat-input-container">
      {showMentions && (
        <div className="chat-mention-popup">
          <div className="chat-mention-header">Упомянуть пользователя</div>
          {mentionUsers.map(u => (
            <div
              key={u.id}
              className="chat-mention-item"
              onClick={() => handleMentionSelect(u)}
            >
              <span className="chat-mention-name">@{u.username}</span>
              <span className="chat-mention-role">{u.role}</span>
            </div>
          ))}
        </div>
      )}

      {showEmoji && (
        <div className="chat-emoji-picker">
          {EMOJI_LIST.map((emoji, i) => (
            <span key={i} className="chat-emoji-item" onClick={() => handleEmojiSelect(emoji)}>
              {emoji}
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="chat-input-form">
        {showAtBtn && chatType !== 'personal' && (
          <button type="button" className="chat-at-btn" onClick={handleAtBtn} title="Упомянуть">
            @
          </button>
        )}
        <button type="button" className="chat-at-btn" onClick={() => { setShowEmoji(!showEmoji); setShowMentions(false); }} title="Эмодзи">
          😊
        </button>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={chatType === 'personal' && !selectedRecipient ? 'Выберите получателя...' : 'Напишите сообщение...'}
          className="chat-input"
          disabled={chatType === 'personal' && !selectedRecipient}
        />
        <button type="submit" className="chat-send-btn" disabled={!canSend}>
          ➤
        </button>
      </form>
    </div>
  );
}
