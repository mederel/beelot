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
# The server answers /api/health once it reaches its database. Debian's own bash reads it, so the image needs no curl.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/${BEELOT_BIND##*:} && printf 'GET /api/health HTTP/1.0\\r\\nHost: localhost\\r\\n\\r\\n' >&3 && head -n 1 <&3 | grep -q ' 200 '"]
USER 10001:10001
ENTRYPOINT ["/usr/bin/beelot-server"]
