import React, { useEffect, useRef, useState } from 'react';
import { useObsStudio } from '../contexts/ObsStudioContext';
import { usePersistentState } from '../helpers/persistant';
import { LOWER_THIRD_SOURCE_NAME as SOURCE_NAME, lowerThirdUrl as graphicUrl } from '../helpers/lowerThird';

const EVENT_NAME = 'ftc-lower-third';
// Time the graphic spends animating in and out, added to the auto-hide time so the
// Show/Hide button flips back roughly when the graphic actually leaves the screen.
const ANIMATION_MS = 2800;

interface LowerThird {
  id: string;
  name: string;
  title: string;
}

const newId = () => Math.random().toString(36).slice(2, 10);

// One entry per line: "Name, Title" or "Name<tab>Title" (pasted from a spreadsheet).
const parseRoster = (text: string): LowerThird[] =>
  text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '')
    .map(line => {
      const separator = line.includes('\t') ? '\t' : ',';
      const index = line.indexOf(separator);
      const [name, title] = index === -1 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)];
      const clean = (value: string) => value.trim().replace(/^"(.*)"$/, '$1');
      return { id: newId(), name: clean(name), title: clean(title) };
    });

const LowerThirdsPanel: React.FC = () => {
  const { status, emitBrowserEvent, addBrowserSourceToCurrentScene } = useObsStudio();
  const [roster, setRoster] = usePersistentState<LowerThird[]>('lowerThirdsRoster', []);
  const [holdSeconds, setHoldSeconds] = usePersistentState<number>('lowerThirdsHoldSeconds', 8);
  const [channel, setChannel] = usePersistentState<string>('lowerThirdsChannel', '');
  // What was last sent to OBS, kept as a copy so editing the row doesn't change it.
  const [onAir, setOnAir] = useState<LowerThird>();
  const [hoverId, setHoverId] = useState<string>();
  const [importText, setImportText] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string>();
  const onAirTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(onAirTimer.current), []);

  const sourceUrl = graphicUrl({ channel });
  // The preview mirrors OBS, except while hovering a Show button.
  const previewEntry = roster.find(entry => entry.id === hoverId) ?? onAir;

  const updateEntry = (id: string, changes: Partial<LowerThird>) =>
    setRoster(entries => entries.map(entry => entry.id === id ? { ...entry, ...changes } : entry));

  const moveEntry = (index: number, offset: number) =>
    setRoster(entries => {
      const target = index + offset;
      if (target < 0 || target >= entries.length) return entries;
      const next = [...entries];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const show = (entry: LowerThird) => {
    emitBrowserEvent(EVENT_NAME, { action: 'show', name: entry.name, title: entry.title, hold: holdSeconds, channel })
      .match(
        () => {
          setMessage(undefined);
          setOnAir({ ...entry });
          setHoverId(undefined);
          clearTimeout(onAirTimer.current);
          if (holdSeconds > 0)
            onAirTimer.current = setTimeout(() => setOnAir(undefined), holdSeconds * 1000 + ANIMATION_MS);
        },
        error => setMessage(`Unable to show lower third: ${error}`)
      );
  };

  const hide = () => {
    emitBrowserEvent(EVENT_NAME, { action: 'hide', channel })
      .match(
        () => {
          setMessage(undefined);
          setOnAir(undefined);
          clearTimeout(onAirTimer.current);
        },
        error => setMessage(`Unable to hide lower third: ${error}`)
      );
  };

  const addSource = () => {
    addBrowserSourceToCurrentScene(SOURCE_NAME, sourceUrl)
      .match(
        ({ sceneName, outcome }) => setMessage({
          created: `Created "${SOURCE_NAME}" in scene "${sceneName}". Switch scenes and click again to add it to more scenes.`,
          added: `Added the existing "${SOURCE_NAME}" to scene "${sceneName}".`,
          present: `"${SOURCE_NAME}" is already in scene "${sceneName}".`,
        }[outcome]),
        error => setMessage(`Unable to add browser source: ${error}`)
      );
  };

  const importRoster = () => {
    setRoster(entries => [...entries, ...parseRoster(importText)]);
    setImportText('');
  };

  const exportRoster = () => {
    const text = roster.map(entry => `${entry.name}\t${entry.title}`).join('\n');
    setImportText(text);
    navigator.clipboard?.writeText(text);
  };

  const showButton = (entry: LowerThird) => entry.id === onAir?.id ? (
    <button className="lower-third-show btn-primary" onClick={hide} disabled={!status.connected}>Hide</button>
  ) : (
    // Hover is on a wrapper so the preview still works while Show is disabled (not connected).
    <span onMouseEnter={() => setHoverId(entry.id)} onMouseLeave={() => setHoverId(undefined)}>
      <button className="lower-third-show" onClick={() => show(entry)} disabled={!status.connected}>Show</button>
    </span>
  );

  // While live: the list with Show and Hide. Editing the list and the browser source settings are
  // for before the event, so they stay out of the way until asked for.
  return (
    // Editing takes the whole width of Run, so the name and title boxes are wide enough to type in.
    <div className={`section lower-thirds${editing ? ' full-width editing' : ''}`}>
      <div className="lower-thirds-header">
        <h2>Lower Thirds</h2>
        <span className="lower-thirds-on-air">
          <span className={`status-pill ${onAir ? 'live' : 'off'}`}>
            {onAir && <span className="status-dot" aria-hidden="true" />}
            {onAir ? `On stream: ${onAir.name}` : 'Nothing on stream'}
          </span>
          {onAir && <button className="btn-primary" onClick={hide} disabled={!status.connected}>Hide</button>}
        </span>
      </div>

      {message && (
        <div className="error-message">
          <p>{message}</p>
        </div>
      )}

      <div className="lower-thirds-body">
        <div className="lower-thirds-list">
          {editing ? (
            <>
              <table className="trigger-table lower-third-table">
                <thead>
                  <tr>
                    <th className="lower-third-name-col">Name</th>
                    <th>Title</th>
                    <th><span className="visually-hidden">Order and delete</span></th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((entry, index) => (
                    <tr key={entry.id} className={entry.id === onAir?.id ? 'on-air' : undefined}>
                      <td>
                        <input type="text" aria-label="Name" value={entry.name} onChange={(e) => updateEntry(entry.id, { name: e.target.value })} />
                      </td>
                      <td>
                        <input type="text" aria-label="Title" value={entry.title} onChange={(e) => updateEntry(entry.id, { title: e.target.value })} />
                      </td>
                      <td>
                        <button onClick={() => moveEntry(index, -1)} disabled={index === 0} title="Move up" aria-label="Move up">↑</button>
                        <button onClick={() => moveEntry(index, 1)} disabled={index === roster.length - 1} title="Move down" aria-label="Move down">↓</button>
                        <button onClick={() => setRoster(entries => entries.filter(e => e.id !== entry.id))} title="Delete" aria-label="Delete">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => setRoster(entries => [...entries, { id: newId(), name: '', title: '' }])}>Add Row</button>
            </>
          ) : roster.length === 0 ? (
            <p className="lower-thirds-empty">No lower thirds yet. Click <strong>Edit list</strong> to add names and titles, or import them from a spreadsheet.</p>
          ) : (
            <ul>
              {roster.map(entry => (
                <li key={entry.id} className={`lower-third-row${entry.id === onAir?.id ? ' on-stream' : ''}`}>
                  <span className="lower-third-text">
                    <span className="lower-third-name">{entry.name || <em>No name</em>}</span>
                    <span className="lower-third-title">{entry.title}</span>
                  </span>
                  {showButton(entry)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lower-third-preview">
          {previewEntry && (
            <iframe
              title="Lower third preview"
              src={graphicUrl({ name: previewEntry.name, title: previewEntry.title, preview: '1' })}
            />
          )}
          <span className="lower-third-preview-label">
            {previewEntry && previewEntry.id === hoverId ? 'Preview' : 'Live'}
          </span>
        </div>
      </div>

      <div className="lower-third-actions">
        <button onClick={() => setEditing(on => !on)} aria-pressed={editing}>{editing ? 'Done editing' : 'Edit list'}</button>
      </div>

      {editing && (
        <div>
          <h3>Import / Export</h3>
          <p>One per line: <code>Name, Title</code>, or paste two columns from a spreadsheet.</p>
          <textarea
            className="lower-third-import"
            aria-label="Lower thirds to import"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'Woodie Flowers, Head Referee\nDrivers Meeting at 10:15, On Field'}
            rows={5}
          />
          <div className="lower-third-actions">
            <button onClick={importRoster} disabled={importText.trim() === ''}>Add to List</button>
            <button onClick={exportRoster} disabled={roster.length === 0}>Export (copy)</button>
            <button onClick={() => window.confirm('Remove every lower third from the list?') && setRoster([])} disabled={roster.length === 0}>Clear List</button>
          </div>
        </div>
      )}

      <details className="lower-third-settings">
        <summary>Browser source settings</summary>
        <p>Setup puts the lower-third browser source in the Ceremony scene. To show lower thirds in another scene, switch OBS to that scene and click <strong>Add to Current Scene</strong>.</p>
        <div className="lower-third-url">
          <code>{sourceUrl}</code>
          <button onClick={() => navigator.clipboard?.writeText(sourceUrl)}>Copy</button>
          <button onClick={addSource} disabled={!status.connected}>Add to Current Scene</button>
        </div>
        <label title="Optional. Only needed when running more than one lower-third browser source; each source listens to its own channel.">
          Channel:
          <input type="text" value={channel} onChange={(e) => setChannel(e.target.value.trim())} className="lower-third-channel" />
        </label>
        <label>
          Auto-hide after:
          <input
            type="number"
            value={holdSeconds}
            onChange={(e) => setHoldSeconds(Math.max(0, parseFloat(e.target.value) || 0))}
            min={0}
            step={1}
          />
          s (0 = stay up until Hide)
        </label>
      </details>
    </div>
  );
};

export default LowerThirdsPanel;
