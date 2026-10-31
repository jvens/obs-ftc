# Playwright's image has its own Chromium, Firefox and WebKit builds; this adds the branded browsers
# the chrome, chrome-beta and msedge projects test (x86-64 only: Google and Microsoft publish no
# Linux ARM builds). Built by run-in-docker.sh.
ARG PLAYWRIGHT_VERSION
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
ARG PLAYWRIGHT_VERSION
RUN npx -y playwright@${PLAYWRIGHT_VERSION} install chrome chrome-beta msedge && rm -rf /root/.npm
