import { useState, useEffect, useCallback } from 'react';
import { getSoul, updateSoul } from '../api';
import './AdminPage.css';

export default function SoulEditor() {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchSoul = useCallback(async () => {
    try {
      setError(null);
      const data = await getSoul();
      setContent(data.content);
      setSavedContent(data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Soul.md');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSoul();
  }, [fetchSoul]);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      await updateSoul(content);
      setSavedContent(content);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setContent(savedContent);
  };

  const hasChanges = content !== savedContent;

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading Soul.md...</p>
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

      {success && (
        <div className="success-banner">
          Soul.md saved successfully!
        </div>
      )}

      <section className="devices-section">
        <div className="section-header">
          <h2>Soul.md</h2>
          <div className="header-actions">
            <button
              className="btn btn-secondary"
              onClick={handleReset}
              disabled={!hasChanges || saving}
            >
              Reset
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
        <p className="hint" style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
          This is the system prompt that defines the bot's personality and behavior.
        </p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{
            width: '100%',
            minHeight: '500px',
            padding: '1rem',
            background: 'var(--bg-color)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius)',
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            lineHeight: '1.6',
            resize: 'vertical',
          }}
        />
      </section>
    </div>
  );
}
