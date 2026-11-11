import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import NetworkAccessHelp from './NetworkAccessHelp';

const FIREFOX = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:155.0) Gecko/20100101 Firefox/155.0', secure: true };
const CHROME = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36', secure: true };

describe('NetworkAccessHelp', () => {
  it('warns in Firefox before connecting to another computer', () => {
    render(<NetworkAccessHelp service="OBS" address="192.168.1.10" failed={false} env={FIREFOX} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Firefox will not connect to OBS on another computer');
    expect(screen.getByRole('alert')).toHaveTextContent('Chrome or Edge');
  });

  it('says nothing in Firefox about this computer', () => {
    const { container } = render(<NetworkAccessHelp service="OBS" address="localhost" failed={true} env={FIREFOX} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing in Chrome until a connection fails', () => {
    const { container } = render(<NetworkAccessHelp service="FTC Live" address="192.168.1.10" failed={false} env={CHROME} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows how to allow local network access after a failure', () => {
    render(<NetworkAccessHelp service="FTC Live" address="192.168.1.10" failed={true} env={CHROME} />);
    expect(screen.getByRole('note')).toHaveTextContent('blocked the connection to FTC Live');
    expect(screen.getByText('Set "Local network access" to "Allow"')).toBeInTheDocument();
    expect(screen.queryByText('Set "Insecure content" to "Allow"')).not.toBeInTheDocument();
  });

  it('adds insecure content for a host name', () => {
    render(<NetworkAccessHelp service="FTC Live" address="scoring.example.com" failed={true} env={CHROME} />);
    expect(screen.getByText('Set "Insecure content" to "Allow"')).toBeInTheDocument();
  });
});
