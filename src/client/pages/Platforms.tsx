import { useState, useEffect } from 'react';
import { getPlatforms, testPlatform, type PlatformStatus } from '../api';
import './AdminPage.css';

interface PlatformConfig {
  key: string;
  name: string;
  description: string;
  secrets: string[];
  status: PlatformStatus | null;
}

const PLATFORM_CONFIGS: Omit<PlatformConfig, 'status'>[] = [
  {
    key: 'twitter',
    name: 'Twitter / X',
    description: 'Post tweets, reply to mentions, and track analytics.',
    secrets: [
      'TWITTER_API_KEY',
      'TWITTER_API_SECRET',
      'TWITTER_ACCESS_TOKEN',
      'TWITTER_ACCESS_SECRET',
      'TWITTER_BEARER_TOKEN',
    ],
  },
  {
    key: 'youtube',
    name: 'YouTube',
    description: 'View channel stats, manage videos, and reply to comments.',
    secrets: [
      'YOUTUBE_API_KEY',
      'YOUTUBE_CHANNEL_ID',
      'YOUTUBE_CLIENT_ID (for write access)',
      'YOUTUBE_CLIENT_SECRET (for write access)',
      'YOUTUBE_REFRESH_TOKEN (for write access)',
    ],
  },
  {
    key: 'instagram',
    name: 'Instagram',
    description: 'View profile insights, manage posts, and reply to comments.',
    secrets: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID'],
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    description: 'View profile, create and manage posts.',
    secrets: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_PERSON_URN'],
  },
  {
    key: 'kling',
    name: 'Kling AI',
    description: 'Generate cinematic video clips from text prompts (~$0.10-0.20/clip).',
    secrets: ['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'],
  },
  {
    key: 'flux',
    name: 'Flux Pro',
    description: 'Generate photorealistic images from text prompts (~$0.04-0.06/image).',
    secrets: ['FLUX_API_KEY'],
  },
  {
    key: 'ideogram',
    name: 'Ideogram',
    description: 'Generate graphics with text overlays from text prompts (~$0.04-0.08/image).',
    secrets: ['IDEOGRAM_API_KEY'],
  },
  {
    key: 'together',
    name: 'Together.ai',
    description: 'Budget image generation via Flux Schnell (~$0.003/image). 20x cheaper than Flux Pro.',
    secrets: ['TOGETHER_API_KEY'],
  },
];

export default function Platforms() {
  const [platforms, setPlatforms] = useState<Record<string, PlatformStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  useEffect(() => {
    loadPlatforms();
  }, []);

  const loadPlatforms = async () => {
    try {
      setError(null);
      const data = await getPlatforms();
      setPlatforms(data.platforms as unknown as Record<string, PlatformStatus>);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platforms');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (platformKey: string) => {
    setTesting(platformKey);
    try {
      const result = await testPlatform(platformKey);
      setTestResult((prev) => ({
        ...prev,
        [platformKey]: {
          ok: result.ok,
          message: result.ok
            ? `Connected! ${JSON.stringify(Object.fromEntries(Object.entries(result).filter(([k]) => k !== 'ok')))}`
            : result.error || 'Connection failed',
        },
      }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [platformKey]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Test failed',
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading platforms...</p>
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
          <h2>Social Platforms</h2>
          <button className="btn btn-secondary" onClick={loadPlatforms}>Refresh</button>
        </div>

        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
          Configure social platform credentials using <code>wrangler secret put</code>.
          Big Earn can then use these platforms via tool calls.
        </p>

        <div className="devices-grid">
          {PLATFORM_CONFIGS.map((config) => {
            const status = platforms[config.key];
            const isConfigured = status?.configured ?? false;
            const result = testResult[config.key];

            return (
              <div
                key={config.key}
                className={`device-card ${isConfigured ? 'paired' : ''}`}
              >
                <div className="device-header">
                  <span className="device-name">{config.name}</span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: isConfigured ? 'var(--success-color, #4caf50)' : 'var(--danger-color, #f44336)',
                    }}
                  />
                </div>
                <div className="device-details">
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    {config.description}
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    <strong>Required secrets:</strong>
                  </p>
                  <ul style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '0.25rem 0', paddingLeft: '1.2rem' }}>
                    {config.secrets.map((s) => (
                      <li key={s}><code>{s}</code></li>
                    ))}
                  </ul>
                </div>
                {result && (
                  <div
                    className={result.ok ? 'success-banner' : 'error-banner'}
                    style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}
                  >
                    {result.message}
                  </div>
                )}
                <div className="device-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => handleTest(config.key)}
                    disabled={!isConfigured || testing === config.key}
                  >
                    {testing === config.key ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
