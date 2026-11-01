# OBS Studio for Linux, from the Ubuntu package OBS publishes with each release, running on a virtual
# display with software OpenGL. Built by integration/obs/obsStudio.ts for each OBS version tested.
ARG UBUNTU_VERSION
FROM ubuntu:${UBUNTU_VERSION}
ARG OBS_DEB_URL
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl xvfb libgl1-mesa-dri \
  && curl -fsSL -o /tmp/obs-studio.deb "$OBS_DEB_URL" \
  && apt-get install -y --no-install-recommends /tmp/obs-studio.deb \
  && rm -rf /tmp/obs-studio.deb /var/lib/apt/lists/*
ENV LIBGL_ALWAYS_SOFTWARE=1
COPY entrypoint.sh /usr/local/bin/obs-on-xvfb
ENTRYPOINT ["obs-on-xvfb"]
