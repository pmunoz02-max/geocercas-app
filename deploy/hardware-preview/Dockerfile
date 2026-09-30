FROM node:24-bookworm-slim
WORKDIR /app
COPY lib/hardware/codec8e.mjs lib/hardware/codec8e-server.mjs lib/hardware/gateway-config.mjs lib/hardware/preview-client.mjs ./lib/hardware/
COPY scripts/hardware-gateway-preview.mjs ./scripts/
USER node
EXPOSE 5027
CMD ["node", "scripts/hardware-gateway-preview.mjs"]
