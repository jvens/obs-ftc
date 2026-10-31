import { afterEach, describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import ObsBrowserSourceWarning, { isRunningInObs } from './ObsBrowserSourceWarning';

afterEach(() => { delete (window as { obsstudio?: unknown }).obsstudio; });

describe('isRunningInObs', () => {
  it('spots the OBS browser source', () => {
    expect(isRunningInObs()).toBe(false);
    (window as { obsstudio?: unknown }).obsstudio = {};
    expect(isRunningInObs()).toBe(true);
  });
});

describe('ObsBrowserSourceWarning', () => {
  it('tells the user where to open the dashboard instead', () => {
    render(<ObsBrowserSourceWarning />);
    expect(screen.getByRole('heading')).toHaveTextContent('Open this page in Chrome, not in OBS');
    expect(screen.getByText('http://localhost/')).toBeInTheDocument();
  });
});
