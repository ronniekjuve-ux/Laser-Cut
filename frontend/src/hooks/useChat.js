import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMessages, sendMessage as apiSendMessage, getUnreadCount, editMessage as apiEditMessage, deleteMessage as apiDeleteMessage, fetchMentions } from '../api/chat';

const MENTIONS_STORAGE_KEY = 'chat_mention_notifications';

function loadMentionsFromStorage() {
  try {
    const raw = localStorage.getItem(MENTIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMentionsToStorage(mentions) {
  try {
    localStorage.setItem(MENTIONS_STORAGE_KEY, JSON.stringify(mentions));
  } catch {}
}

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mentionNotifications, setMentionNotifications] = useState(() => loadMentionsFromStorage());
  const [activeTab, setActiveTab] = useState('general');
  const [chatId, setChatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scrollToId, setScrollToId] = useState(null);
  const wsRef = useRef(null);
  const seenIdsRef = useRef(new Set());

  // Persist mentions to localStorage
  useEffect(() => {
    saveMentionsToStorage(mentionNotifications);
  }, [mentionNotifications]);

  // Load mentions from backend on mount
  useEffect(() => {
    fetchMentions()
      .then(data => {
        if (data && data.length > 0) {
          const stored = loadMentionsFromStorage();
          const storedIds = new Set(stored.map(n => n.message_id));
          const newNotifs = data
            .filter(m => !storedIds.has(m.message_id))
            .map(m => ({
              id: m.id,
              message_id: m.message_id,
              sender_username: m.sender_username,
              content: m.content,
              chat_type: 'general',
              created_at: m.created_at,
              read: false
            }));
          if (newNotifs.length > 0) {
            setMentionNotifications(prev => [...prev, ...newNotifs]);
          }
        }
      })
      .catch(() => {});
  }, []);

  const loadMessages = useCallback(async (chatType = null, chatIdParam = null) => {
    setLoading(true);
    try {
      const data = await fetchMessages(chatType, 50, 0, null, chatIdParam);
      setMessages(data);
      data.forEach(m => seenIdsRef.current.add(m.id));
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUnread = useCallback(async () => {
    try {
      const count = await getUnreadCount();
      setUnreadCount(count);
    } catch (err) {
      console.error('Failed to load unread count:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'general') {
      loadMessages('general');
    } else {
      loadMessages('personal', chatId);
    }
    loadUnread();
  }, [activeTab, chatId, loadMessages, loadUnread]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/ws?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Heartbeat interval - send every 30 seconds
    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 30000);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_message') {
          const msg = data.message;
          if (seenIdsRef.current.has(msg.id)) return;
          seenIdsRef.current.add(msg.id);
          setMessages(prev => [...prev, msg]);
          setUnreadCount(prev => prev + 1);
        } else if (data.type === 'mention_notification') {
          console.log('[CHAT] Received mention_notification:', data);
          setMentionNotifications(prev => {
            const exists = prev.some(n => n.message_id === data.message_id);
            if (exists) return prev;
            return [...prev, {
              id: Date.now(),
              message_id: data.message_id,
              sender_username: data.sender_username,
              content: data.content,
              chat_type: data.chat_type,
              created_at: data.created_at || new Date().toISOString(),
              read: false
            }];
          });
        } else if (data.type === 'message_edited') {
          const edited = data.message;
          setMessages(prev => prev.map(m => m.id === edited.id ? { ...m, content: edited.content, is_edited: true } : m));
        } else if (data.type === 'message_deleted') {
          const deleted = data.message;
          setMessages(prev => prev.map(m => m.id === deleted.id ? { ...m, is_deleted: true, content: '' } : m));
        } else if (data.type === 'heartbeat_ack') {
          // Heartbeat acknowledged
        }
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };

    ws.onclose = () => {
      clearInterval(heartbeatInterval);
      setTimeout(() => {}, 5000);
    };

    return () => {
      clearInterval(heartbeatInterval);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const sendMessage = useCallback(async (data) => {
    try {
      const message = await apiSendMessage(data);
      seenIdsRef.current.add(message.id);
      setMessages(prev => [...prev, message]);
      return message;
    } catch (err) {
      console.error('Failed to send message:', err);
      throw err;
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (messages.length === 0) return;
    const oldest = messages[0];
    try {
      const older = await fetchMessages(
        activeTab === 'general' ? 'general' : 'personal',
        50, 0, oldest.id, chatId
      );
      setMessages(prev => [...older, ...prev]);
    } catch (err) {
      console.error('Failed to load more messages:', err);
    }
  }, [messages, activeTab, chatId]);

  const markMentionRead = useCallback((notifId) => {
    setMentionNotifications(prev =>
      prev.map(n => n.id === notifId ? { ...n, read: true } : n)
    );
  }, []);

  const clearMentions = useCallback(() => {
    setMentionNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const jumpToMessage = useCallback((messageId) => {
    setScrollToId(messageId);
  }, []);

  const editMsg = useCallback(async (messageId, content) => {
    try {
      const updated = await apiEditMessage(messageId, content);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: updated.content, is_edited: true } : m));
      return updated;
    } catch (err) {
      console.error('Failed to edit message:', err);
      throw err;
    }
  }, []);

  const deleteMsg = useCallback(async (messageId) => {
    try {
      await apiDeleteMessage(messageId);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true, content: '' } : m));
    } catch (err) {
      console.error('Failed to delete message:', err);
      throw err;
    }
  }, []);

  return {
    messages,
    unreadCount,
    mentionNotifications,
    sendMessage,
    loadMore,
    activeTab,
    setActiveTab,
    chatId,
    setChatId,
    loading,
    setUnreadCount,
    markMentionRead,
    clearMentions,
    jumpToMessage,
    scrollToId,
    setScrollToId,
    editMsg,
    deleteMsg
  };
}
