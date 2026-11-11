import React, { useMemo } from 'react';
import { useAppSelector } from '../store/hooks';
import { selectFieldCount } from '../store/connectionSlice';
import { selectMatches } from '../store/matchDataSlice';
import { fieldStatuses } from './fields';

// What each field is doing: its latest match, how far along it is, and the teams playing.
const FieldStatus: React.FC = () => {
  const matches = useAppSelector(selectMatches);
  const fieldCount = useAppSelector(selectFieldCount);
  const fields = useMemo(() => fieldStatuses(matches, fieldCount), [matches, fieldCount]);

  return (
    <div className="section field-status">
      <h2>On the Fields</h2>
      <ul>
        {fields.map(({ field, match }) => (
          <li key={field} className="field-status-row">
            <div className="field-status-head">
              <span className="field-status-name">Field {field}</span>
              {match && (
                <span className={`status-pill ${match.tone}`}>
                  {match.tone === 'live' && <span className="status-dot" aria-hidden="true" />}
                  {match.phase}
                </span>
              )}
            </div>
            {match ? (
              <span className="field-status-match">
                <strong>{match.name}</strong>
                {match.red.length > 0 && <> · <span className="alliance-red">Red {match.red.join(', ')}</span></>}
                {match.blue.length > 0 && <> · <span className="alliance-blue">Blue {match.blue.join(', ')}</span></>}
              </span>
            ) : (
              <span className="field-status-match muted">No match yet</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FieldStatus;
