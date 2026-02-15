import { useState, useEffect, useCallback } from 'react';
import {
  getStatus,
  registerWebhook,
  unregisterWebhook,
  updateConfig,
  updateAllowlist,
  type BotStatus as BotStatusType,
} from '../api';
import './AdminPage.css';

function ButtonSpinner() {
  return <span className="btn-spinner" />;
}

export default function BotStatus() {
  const [status, setStatus] = useState<BotStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [modelInput, setModelInput] = useState('');
  const [userIdInput, setUserIdInput] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const data = await getStatus();
      setStatus(data);
      setModelInput(data.model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleRegisterWebhook = async () => {
    setActionInProgress('register');
    try {
      await registerWebhook();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register webhook');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleUnregisterWebhook = async () => {
    setActionInProgress('unregister');
    try {
      await unregisterWebhook();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unregister webhook');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleUpdateModel = async () => {
    setActionInProgress('model');
    try {
      await updateConfig({ model: modelInput });
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update model');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleAddUser = async () => {
    const id = parseInt(userIdInput, 10);
    if (isNaN(id)) {
      setError('Please enter a valid numeric user ID');
      return;
    }
    if (!status) return;

    setActionInProgress('adduser');
    try {
      const newList = [...status.allowedUsers, id];
      await updateAllowlist(newList);
      setUserIdInput('');
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add user');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRemoveUser = async (id: number) => {
    if (!status) return;
    setActionInProgress(`remove-${id}`);
    try {
      const newList = status.allowedUsers.filter((u) => u !== id);
      await updateAllowlist(newList);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove user');
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading status...</p>
      </div>
    );
  }

  return (
    <div className="devices-page">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="dismiss-btn">
            Dismiss
          </button>
        </div>
      )}

      {/* Bot Info */}
      <section className="devices-section">
        <div className="section-header">
          <h2>Bot Info</h2>
          <button className="btn btn-secondary" onClick={fetchStatus}>
            Refresh
          </button>
        </div>
        <div className="device-details">
          <div className="detail-row">
            <span className="label">Bot:</span>
            <span className="value">
              {status?.bot ? `@${status.bot.username || status.bot.first_name}` : 'Not connected'}
            </span>
          </div>
          <div className="detail-row">
            <span className="label">API Key:</span>
            <span className="value">{status?.hasApiKey ? 'Configured' : 'Missing'}</span>
          </div>
          <div className="detail-row">
            <span className="label">Bot Token:</span>
            <span className="value">{status?.hasBotToken ? 'Configured' : 'Missing'}</span>
          </div>
          <div className="detail-row">
            <span className="label">Conversations:</span>
            <span className="value">{status?.conversationCount ?? 0}</span>
          </div>
        </div>
      </section>

      {/* Webhook */}
      <section className="devices-section">
        <div className="section-header">
          <h2>Webhook</h2>
          <div className="header-actions">
            <button
              className="btn btn-primary"
              onClick={handleRegisterWebhook}
              disabled={actionInProgress !== null}
            >
              {actionInProgress === 'register' && <ButtonSpinner />}
              Register Webhook
            </button>
            <button
              className="btn btn-danger"
              onClick={handleUnregisterWebhook}
              disabled={actionInProgress !== null}
            >
              {actionInProgress === 'unregister' && <ButtonSpinner />}
              Unregister
            </button>
          </div>
        </div>
        <div className="device-details">
          <div className="detail-row">
            <span className="label">URL:</span>
            <span className="value">{status?.webhook?.url || 'Not registered'}</span>
          </div>
          <div className="detail-row">
            <span className="label">Pending:</span>
            <span className="value">{status?.webhook?.pending_update_count ?? '-'}</span>
          </div>
          {status?.webhook?.last_error_message && (
            <div className="detail-row">
              <span className="label">Last Error:</span>
              <span className="value" style={{ color: 'var(--error-color)' }}>
                {status.webhook.last_error_message}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Model Config */}
      <section className="devices-section">
        <div className="section-header">
          <h2>Model</h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: 'var(--bg-color)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--border-radius)',
              color: 'var(--text-primary)',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
            }}
          />
          <button
            className="btn btn-primary"
            onClick={handleUpdateModel}
            disabled={actionInProgress !== null || modelInput === status?.model}
          >
            {actionInProgress === 'model' && <ButtonSpinner />}
            Save
          </button>
        </div>
      </section>

      {/* Allowed Users */}
      <section className="devices-section">
        <div className="section-header">
          <h2>Allowed Users</h2>
        </div>
        {status?.allowedUsers.length === 0 && (
          <p className="hint" style={{ marginBottom: '1rem', color: 'var(--warning-color)' }}>
            No users in allowlist - all users are currently allowed.
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            placeholder="Telegram user ID"
            style={{
              flex: 1,
              padding: '0.5rem',
              background: 'var(--bg-color)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--border-radius)',
              color: 'var(--text-primary)',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
          />
          <button
            className="btn btn-success"
            onClick={handleAddUser}
            disabled={actionInProgress !== null}
          >
            {actionInProgress === 'adduser' && <ButtonSpinner />}
            Add
          </button>
        </div>
        {status && status.allowedUsers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {status.allowedUsers.map((id) => (
              <span
                key={id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.25rem 0.75rem',
                  background: 'var(--surface-hover)',
                  borderRadius: '999px',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace',
                }}
              >
                {id}
                <button
                  onClick={() => handleRemoveUser(id)}
                  disabled={actionInProgress !== null}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--error-color)',
                    cursor: 'pointer',
                    padding: '0 0.25rem',
                    fontSize: '1rem',
                    lineHeight: 1,
                  }}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
