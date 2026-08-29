import client from './client';

export async function fetchMessages(chatType = null, limit = 50, offset = 0, before = null) {
  const params = { limit, offset };
  if (chatType) params.chat_type = chatType;
  if (before) params.before = before;
  const res = await client.get('/api/chat/messages', { params });
  return res.data;
}

export async function sendMessage(data) {
  const res = await client.post('/api/chat/messages', data);
  return res.data;
}

export async function getUnreadCount() {
  const res = await client.get('/api/chat/unread');
  return res.data.count;
}

export async function fetchChatUsers() {
  const res = await client.get('/api/chat/users');
  return res.data;
}
