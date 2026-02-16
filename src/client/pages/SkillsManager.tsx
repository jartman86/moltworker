import { useState, useEffect, useCallback } from 'react';
import {
  getSkills,
  getSkill,
  updateSkill,
  deleteSkill,
  getSkillVersions,
  restoreSkillVersion,
  type SkillMeta,
  type SkillVersionInfo,
} from '../api';
import './AdminPage.css';

export default function SkillsManager() {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [viewingVersions, setViewingVersions] = useState<string | null>(null);
  const [versions, setVersions] = useState<SkillVersionInfo[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState(false);

  const fetchSkills = useCallback(async () => {
    try {
      setError(null);
      const data = await getSkills();
      setSkills(data.skills);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleEdit = async (name: string) => {
    try {
      const data = await getSkill(name);
      setEditingSkill(name);
      setEditContent(data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skill');
    }
  };

  const handleSave = async () => {
    if (!editingSkill) return;
    setSaving(true);
    try {
      await updateSkill(editingSkill, editContent);
      setEditingSkill(null);
      await fetchSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skill');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete skill "${name}"?`)) return;
    try {
      await deleteSkill(name);
      if (editingSkill === name) setEditingSkill(null);
      await fetchSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete skill');
    }
  };

  const handleCreate = () => {
    setCreating(true);
    setNewName('');
  };

  const handleCreateConfirm = () => {
    const name = newName.trim().replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    if (!name) return;
    setCreating(false);
    setEditingSkill(name);
    setEditContent(`---\nname: ${name}\ndescription: \n---\n\n# ${name}\n\n`);
  };

  const handleViewVersions = async (name: string) => {
    setViewingVersions(name);
    setLoadingVersions(true);
    try {
      const data = await getSkillVersions(name);
      setVersions(data.versions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load versions');
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleRestore = async (name: string, timestamp: number) => {
    if (!confirm(`Restore skill "${name}" to version from ${new Date(timestamp).toLocaleString()}?`)) return;
    setRestoringVersion(true);
    try {
      await restoreSkillVersion(name, timestamp);
      setViewingVersions(null);
      await fetchSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore version');
    } finally {
      setRestoringVersion(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading skills...</p>
      </div>
    );
  }

  // Editing view
  if (editingSkill) {
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
            <h2>{editingSkill}</h2>
            <div className="header-actions">
              <button className="btn btn-secondary" onClick={() => setEditingSkill(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
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

  // Version history view
  if (viewingVersions) {
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
            <h2>Version History: {viewingVersions}</h2>
            <button className="btn btn-secondary" onClick={() => setViewingVersions(null)}>
              Back
            </button>
          </div>
          {loadingVersions ? (
            <div className="loading"><div className="spinner" /><p>Loading versions...</p></div>
          ) : versions.length === 0 ? (
            <div className="empty-state"><p>No version history for this skill.</p></div>
          ) : (
            <div className="devices-grid">
              {versions.map((v) => (
                <div key={v.timestamp} className="device-card paired">
                  <div className="device-header">
                    <span className="device-name">
                      {new Date(v.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="device-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() => handleRestore(viewingVersions, v.timestamp)}
                      disabled={restoringVersion}
                    >
                      {restoringVersion ? 'Restoring...' : 'Restore'}
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
          <h2>Skills</h2>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={fetchSkills}>Refresh</button>
            <button className="btn btn-primary" onClick={handleCreate}>New Skill</button>
          </div>
        </div>

        {creating && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="skill-name"
              autoFocus
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
              onKeyDown={(e) => e.key === 'Enter' && handleCreateConfirm()}
            />
            <button className="btn btn-success" onClick={handleCreateConfirm}>Create</button>
            <button className="btn btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        )}

        <p className="hint" style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
          Skills are markdown documents that teach the bot new capabilities.
          Use YAML frontmatter with name and description fields.
        </p>

        {skills.length === 0 ? (
          <div className="empty-state">
            <p>No skills yet</p>
            <p className="hint">Create a skill to teach the bot new capabilities.</p>
          </div>
        ) : (
          <div className="devices-grid">
            {skills.map((skill) => (
              <div key={skill.name} className="device-card paired">
                <div className="device-header">
                  <span className="device-name">{skill.name}</span>
                </div>
                {skill.description && (
                  <div className="device-details">
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                      {skill.description}
                    </p>
                  </div>
                )}
                <div className="device-actions">
                  <button className="btn btn-primary" onClick={() => handleEdit(skill.name)}>
                    Edit
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleViewVersions(skill.name)}>
                    History
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(skill.name)}>
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
