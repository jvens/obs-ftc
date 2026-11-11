import React, { useState } from 'react';
import { ResultAsync } from 'neverthrow';
import { BrowserEnv, connectHelp, currentBrowser, firefoxBlocks } from '../helpers/browserNetwork';

interface Props {
  // What the page connects to, as shown to the user: "FTC Live" or "OBS".
  service: string;
  // The address typed for it.
  address: string;
  // The last attempt to connect failed.
  failed: boolean;
  env?: BrowserEnv;
}

// Firefox: a warning as soon as the address is another computer, since nothing the user can allow
// for this site lets the connection through. Other browsers: once a connection fails, how to allow
// local network access (and insecure content for a host name).
// Copies this page's address, to paste into Chrome or Edge.
const CopyPageAddress: React.FC = () => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = () => {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      setState('failed');
      return;
    }
    ResultAsync.fromPromise(clipboard.writeText(window.location.href), () => 'failed' as const)
      .match(() => setState('copied'), () => setState('failed'));
  };
  return (
    <span className="network-help-copy">
      <button onClick={copy}>Copy this page's address</button>
      <span role="status">
        {state === 'copied' ? 'Copied. Paste it into Chrome or Edge.' : state === 'failed' ? `Copy it from the address bar: ${window.location.href}` : ''}
      </span>
    </span>
  );
};

const NetworkAccessHelp: React.FC<Props> = ({ service, address, failed, env = currentBrowser() }) => {
  if (firefoxBlocks(env, address)) {
    return (
      <div className="error-message network-help firefox-blocked" role="alert">
        <svg className="network-help-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M4.9 4.9l14.2 14.2" /></svg>
        <div className="network-help-text">
          <strong className="network-help-title">Firefox cannot connect to {service} on another computer</strong>
          <p>
            This page is secure (https), and Firefox will not let a secure page open the unencrypted connection that
            {' '}{service} at <code>{address.trim()}</code> uses. Nothing in Firefox's settings for this site changes that.
          </p>
          <p><strong>Open this page in Chrome or Edge instead.</strong> They ask to allow the connection.</p>
          <CopyPageAddress />
        </div>
      </div>
    );
  }

  const help = connectHelp(env, address, failed);
  if (help === 'none') return null;
  return (
    <div className="connection-helper network-help" role="note">
      <p>The browser may have blocked the connection to {service}. If it asked to access devices on your local network, choose Allow. Otherwise:</p>
      <div className="connection-helper-steps">
        <ol>
          <li>Click the icon left of the address and open "Site settings"</li>
          <li>Set "Local network access" to "Allow"</li>
          {help === 'local-network-and-insecure-content' && <li>Set "Insecure content" to "Allow"</li>}
          <li>Reload this page</li>
        </ol>
      </div>
    </div>
  );
};

export default NetworkAccessHelp;
