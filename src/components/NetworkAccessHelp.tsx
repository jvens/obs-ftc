import React from 'react';
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
const NetworkAccessHelp: React.FC<Props> = ({ service, address, failed, env = currentBrowser() }) => {
  if (firefoxBlocks(env, address)) {
    return (
      <div className="error-message network-help" role="alert">
        <p>
          Firefox will not connect to {service} on another computer from this page. Open this page in Chrome or
          Edge instead.
        </p>
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
