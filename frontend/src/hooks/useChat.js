import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMessages, sendMessage as apiSendMessage, getUnreadCount } from '../api/chat';

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const wsRef = useRef(null);

  const loadMessages = useCallback(async (chatType = null) => {
    setLoading(true);
    try {
      const data = await fetchMessages(chatType);
      setMessages(data);
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
    loadMessages(activeTab === 'general' ? 'general' : null);
    loadUnread();
  }, [activeTab, loadMessages, loadUnread]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/ws?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_message') {
          setMessages(prev => [...prev, data.message]);
          setUnreadCount(prev => prev + 1);
        }
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };

    ws.onclose = () => {
      setTimeout(() => {
        // Reconnect logic
      }, 5000);
    };

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const sendMessage = useCallback(async (data) => {
    try {
      const message = await apiSendMessage(data);
      // Optimistic update
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
      const older = await fetchMessages(activeTab === 'general' ? 'general' : null, 50, 0, oldest.id);
      setMessages(prev => [...older, ...prev]);
    } catch (err) {
      console.error('Failed to load more messages:', err);
    }
  }, [messages, activeTab]);

  return {
    messages,
    unreadCount,
    sendMessage,
    loadMore,
    activeTab,
    setActiveTab,
    loading,
    setUnreadCount
  };
}
