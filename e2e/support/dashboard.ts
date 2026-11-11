// Moving around the dashboard the way a volunteer does: its views (the tabs in the header) and the
// Setup view's steps.
import type { Page } from '@playwright/test';

export const showView = (page: Page, name: 'Setup' | 'Run' | 'Outputs' | 'Matches') =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('link', { name, exact: true }).click();

export type SetupStep = 'ftc-live' | 'obs' | 'scenes' | 'audio' | 'settings' | 'switching';

// Opens a Setup step from the step list, switching to the Setup view first.
export const showStep = async (page: Page, step: SetupStep) => {
  await showView(page, 'Setup');
  await page.getByRole('navigation', { name: 'Setup steps' }).locator(`a[href="#setup/${step}"]`).click();
};

const STEP_TITLES: Record<SetupStep, string> = {
  'ftc-live': 'Connect to FTC Live',
  obs: 'Connect to OBS Studio',
  scenes: 'Scenes and cameras',
  audio: 'Audio',
  settings: 'Stream and recording settings',
  switching: 'Scene switching',
};

// A Setup step's settings, found by the step's name.
export const stepArea = (page: Page, step: SetupStep) => page.getByRole('region', { name: STEP_TITLES[step], exact: true });
