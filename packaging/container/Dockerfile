# Beelot's container image (US-135). It packs what the release build already made: .github/scripts/stage-container.sh puts
# the server binary and the frontend next to this file, and the image is built from that directory. The base is Debian
# 13 (glibc 2.41), newer than the Ubuntu 24.04 (2.39) the binary is built on. All state lives in the database: the image
# has no volume.
FROM debian:trixie-slim

ARG VERSION=dev
LABEL org.opencontainers.image.title="Beelot" \
      org.opencontainers.image.description="A Belote card game server" \
      org.opencontainers.image.source="https://github.com/mederel/beelot" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.version="$VERSION"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin beelot

COPY beelot-server /usr/bin/beelot-server
COPY static /usr/share/beelot/static

# Listen on every interface of the container: the published port, or a proxy on the same network, is the way in.
ENV BEELOT_BIND=0.0.0.0:8080 \
    BEELOT_STATIC_DIR=/usr/share/beelot/static
EXPOSE 8080
USER 10001:10001
ENTRYPOINT ["/usr/bin/beelot-server"]
