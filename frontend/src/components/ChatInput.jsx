import { useState, useRef, useEffect } from 'react';
import { fetchChatUsers } from '../api/chat';

export default function ChatInput({ onSend, chatType = 'general' }) {
  const [text, setText] = useState('');
  const [users, setUsers] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedMentions, setSelectedMentions] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchChatUsers().then(setUsers).catch(console.error);
  }, []);

  const handleInput = (e) => {
    const value = e.target.value;
    setText(value);

    // Check for @ mention trigger
    const lastAt = value.lastIndexOf('@');
    if (lastAt !== -1 && lastAt === value.length - 1) {
      setShowMentions(true);
      setMentionFilter('');
    } else if (lastAt !== -1) {
      const afterAt = value.slice(lastAt + 1);
      if (!afterAt.includes(' ')) {
        setShowMentions(true);
        setMentionFilter(afterAt.toLowerCase());
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const selectMention = (user) => {
    const lastAt = text.lastIndexOf('@');
    const beforeAt = text.slice(0, lastAt);
    setText(`${beforeAt}@${user.username} `);
    setSelectedMentions(prev => [...prev, user.id]);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    onSend({
      chat_type: chatType,
      content: text.trim(),
      mention_ids: selectedMentions.length > 0 ? selectedMentions : undefined
    });

    setText('');
    setSelectedMentions([]);
  };

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(mentionFilter)
  );

  return (
    <div className="chat-input-container">
      {showMentions && filteredUsers.length > 0 && (
        <div className="chat-mentions-dropdown">
          {filteredUsers.map(u => (
            <div
              key={u.id}
              className="chat-mention-item"
              onClick={() => selectMention(u)}
            >
              @{u.username}
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={handleInput}
          placeholder="Напишите сообщение..."
          className="chat-input"
        />
        <button type="submit" className="chat-send-btn">
          ➤
        </button>
      </form>
    </div>
  );
}
