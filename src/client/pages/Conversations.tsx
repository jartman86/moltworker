import { useState, useEffect, useCallback } from 'react';
import {
  getConversations,
  getConversation,
  deleteConversation,
  type ConversationSummary,
  type ConversationDetail,
} from '../api';
import './AdminPage.css';

function formatTime(ts: number): string {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString();
}

function formatTimeAgo(ts: number): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Conversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedChat, setSelectedChat] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      setError(null);
      const data = await getConversations();
      setConversations(data.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleView = async (chatId: number) => {
    try {
      setError(null);
      const data = await getConversation(chatId);
      setSelectedChat(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    }
  };

  const handleDelete = async (chatId: number) => {
    if (!confirm(`Delete conversation ${chatId}?`)) return;
    try {
      await deleteConversation(chatId);
      if (selectedChat?.chatId === chatId) setSelectedChat(null);
      await fetchConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation');
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading conversations...</p>
      </div>
    );
  }

  // Detail view
  if (selectedChat) {
    return (
      <div className="devices-page">
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="dismiss-btn">Dismiss</button>
          </div>
        )}
        <section className="devices-section">
          <div className="section-header">
            <h2>Chat {selectedChat.chatId}</h2>
            <div className="header-actions">
              <button className="btn btn-secondary" onClick={() => setSelectedChat(null)}>
                Back
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(selectedChat.chatId)}>
                Delete
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {selectedChat.messages.length === 0 ? (
              <div className="empty-state">
                <p>No messages</p>
              </div>
            ) : (
              selectedChat.messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--border-radius)',
                    background:
                      msg.role === 'user' ? 'var(--surface-hover)' : 'var(--bg-color)',
                    borderLeft: `3px solid ${msg.role === 'user' ? 'var(--primary-color)' : 'var(--success-color)'}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {msg.role === 'user' ? 'User' : 'Assistant'}
                    </span>
                    <span>{formatTime(msg.timestamp)}</span>
                  </div>
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: '0.875rem',
                      lineHeight: '1.5',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    );
  }

  // List view
  return (
    <div className="devices-page">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="dismiss-btn">Dismiss</button>
        </div>
      )}

      <section className="devices-section">
        <div className="section-header">
          <h2>Conversations</h2>
          <button className="btn btn-secondary" onClick={fetchConversations}>
            Refresh
          </button>
        </div>

        {conversations.length === 0 ? (
          <div className="empty-state">
            <p>No conversations yet</p>
            <p className="hint">Conversations will appear here when users message the bot.</p>
          </div>
        ) : (
          <div className="devices-grid">
            {conversations.map((conv) => (
              <div key={conv.chatId} className="device-card paired">
                <div className="device-header">
                  <span className="device-name">Chat {conv.chatId}</span>
                  <span className="device-badge paired">{conv.messageCount} msgs</span>
                </div>
                <div className="device-details">
                  <div className="detail-row">
                    <span className="label">Updated:</span>
                    <span className="value">{formatTimeAgo(conv.updatedAt)}</span>
                  </div>
                </div>
                <div className="device-actions">
                  <button className="btn btn-primary" onClick={() => handleView(conv.chatId)}>
                    View
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(conv.chatId)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
