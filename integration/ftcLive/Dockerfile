# FTC Live, the FTC scoring system, from FIRST's Linux download, running without a display. Built by
# integration/ftcLive/ftcLive.ts for the current release.
FROM ubuntu:26.04
ARG FTC_LIVE_URL
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl xdg-user-dirs \
  && rm -rf /var/lib/apt/lists/*
# FIRST's package leaves the JRE's spawn helper without its execute bit, which FTC Live needs.
RUN curl -fsSL -o /tmp/ftclive.tar.gz "$FTC_LIVE_URL" \
  && mkdir /opt/ftclive \
  && tar -xzf /tmp/ftclive.tar.gz -C /opt/ftclive --strip-components=1 \
  && rm /tmp/ftclive.tar.gz \
  && chmod +x /opt/ftclive/jre/lib/jspawnhelper
COPY start.sh /usr/local/bin/ftclive
# The first run downloads FTC Live itself; doing it here lets each test run start in seconds.
RUN ftclive --prepare
EXPOSE 80
ENTRYPOINT ["ftclive"]
