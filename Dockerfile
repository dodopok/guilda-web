# syntax=docker/dockerfile:1
# Imagem única para a aplicação web e o trabalhador (processos separados).
FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NUXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY . .
# O secret "extra_ca" é opcional: só é necessário atrás de proxy com TLS próprio.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi \
    && corepack enable && pnpm install --frozen-lockfile && pnpm build && chown -R node:node /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
USER node
CMD ["node", ".output/server/index.mjs"]
