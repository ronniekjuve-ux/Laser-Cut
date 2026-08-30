import client from './client';

export async function fetchMessages(chatType = null, limit = 50, offset = 0, before = null, chatId = null) {
  const params = { limit, offset };
  if (chatType) params.chat_type = chatType;
  if (before) params.before = before;
  if (chatId) params.chat_id = chatId;
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

export async function editMessage(messageId, content) {
  const res = await client.put(`/api/chat/messages/${messageId}`, { content });
  return res.data;
}

export async function deleteMessage(messageId) {
  const res = await client.delete(`/api/chat/messages/${messageId}`);
  return res.data;
}

export async function fetchMentions() {
  const res = await client.get('/api/chat/mentions');
  return res.data;
}
