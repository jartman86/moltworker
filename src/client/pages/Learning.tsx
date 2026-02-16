import { useState, useEffect } from 'react';
import {
  getFeedbackSummary,
  triggerLearningAnalysis,
  getToolLogs,
  type FeedbackSummary,
  type LearningAnalysis,
  type ToolLog,
} from '../api';
import './AdminPage.css';

export default function Learning() {
  const [feedback, setFeedback] = useState<FeedbackSummary | null>(null);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<LearningAnalysis | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      const [fb, logs] = await Promise.all([
        getFeedbackSummary(),
        getToolLogs(),
      ]);
      setFeedback(fb);
      setToolLogs(logs.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const result = await triggerLearningAnalysis();
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading learning data...</p>
      </div>
    );
  }

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
          <h2>Feedback Overview</h2>
          <button className="btn btn-secondary" onClick={loadData}>Refresh</button>
        </div>

        {feedback && (
          <div className="devices-grid">
            <div className="device-card paired">
              <div className="device-header">
                <span className="device-name">Total Feedback</span>
              </div>
              <div className="device-details">
                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {feedback.total}
                </p>
              </div>
            </div>
            <div className="device-card paired">
              <div className="device-header">
                <span className="device-name">Positive</span>
              </div>
              <div className="device-details">
                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success-color, #4caf50)' }}>
                  {feedback.positive}
                </p>
              </div>
            </div>
            <div className="device-card paired">
              <div className="device-header">
                <span className="device-name">Negative</span>
              </div>
              <div className="device-details">
                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--danger-color, #f44336)' }}>
                  {feedback.negative}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {feedback && feedback.recentNegative.length > 0 && (
        <section className="devices-section">
          <div className="section-header">
            <h2>Recent Negative Feedback</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Time</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>User Message</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {feedback.recentNegative.map((entry, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.5rem', color: 'var(--text-primary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {entry.userMessage.slice(0, 100)}
                    </td>
                    <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
                      {entry.feedbackText || '(thumbs down only)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="devices-section">
        <div className="section-header">
          <h2>Self-Improvement</h2>
        </div>
        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
          Trigger an analysis of recent feedback. Big Earn will review feedback patterns
          and propose skill updates (which require confirmation before applying).
        </p>
        <button
          className="btn btn-primary"
          onClick={handleAnalyze}
          disabled={analyzing}
        >
          {analyzing ? 'Analyzing...' : 'Trigger Analysis'}
        </button>

        {analysis && (
          <div style={{ marginTop: '1rem' }}>
            <div className="device-card paired">
              <div className="device-header">
                <span className="device-name">Analysis Result</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {analysis.iterations} iteration(s), {analysis.tokens.input + analysis.tokens.output} tokens
                </span>
              </div>
              <div className="device-details">
                <pre style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  lineHeight: '1.5',
                  background: 'var(--bg-color)',
                  padding: '1rem',
                  borderRadius: 'var(--border-radius)',
                }}>
                  {analysis.analysis}
                </pre>
              </div>
              {analysis.toolCalls.length > 0 && (
                <div style={{ marginTop: '0.5rem', padding: '0 1rem 1rem' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                    Tools used: {analysis.toolCalls.map((t) => t.toolName).join(', ')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="devices-section">
        <div className="section-header">
          <h2>Tool Execution Logs</h2>
          <button className="btn btn-secondary" onClick={() => setShowLogs(!showLogs)}>
            {showLogs ? 'Hide' : 'Show'} Logs
          </button>
        </div>

        {showLogs && (
          toolLogs.length === 0 ? (
            <div className="empty-state">
              <p>No tool execution logs yet.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Time</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Chat</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Tools</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {toolLogs.slice(0, 50).map((log, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.5rem', color: 'var(--text-primary)' }}>
                        {log.chatId}
                      </td>
                      <td style={{ padding: '0.5rem', color: 'var(--text-primary)' }}>
                        {log.toolCalls.map((t) => t.toolName).join(', ')}
                      </td>
                      <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
                        {log.inputTokens + log.outputTokens}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  );
}
