FROM rust:1-slim-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends git pkg-config libssl-dev protobuf-compiler ca-certificates curl && rm -rf /var/lib/apt/lists/*
ARG PASTA_REV=64007a84159e85fb4cfe9c3f34279749cd4312cf
RUN git clone https://github.com/orriborri/pasta.git /src && git -C /src checkout "$PASTA_REV"
WORKDIR /src
RUN cargo build --locked --release -p pasta-backend -p kb-cli -p kb-mcp
RUN curl -fsSL https://github.com/steipete/gogcli/releases/download/v0.48.1/gogcli_0.48.1_linux_amd64.tar.gz -o /tmp/gog.tgz && echo 'dcd956e09d1222a07c1304d836f8acd55266b2fa241ef466580ced6a02453d72  /tmp/gog.tgz' | sha256sum -c - && tar -xzf /tmp/gog.tgz -C /usr/local/bin gog
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git python3 && rm -rf /var/lib/apt/lists/* && useradd -u 10000 -m pasta
COPY --from=builder /src/target/release/pasta-backend /src/target/release/kb /src/target/release/kb-mcp /usr/local/bin/
COPY --from=builder /usr/local/bin/gog /usr/local/bin/gog
# Ship the pinned maintenance tools as image artifacts, outside persistent data.
COPY --from=builder /src/llm-wiki /opt/llm-wiki
ENV HOME=/var/lib/pasta
USER 10000:10000
WORKDIR /var/lib/pasta
CMD ["pasta-backend"]
