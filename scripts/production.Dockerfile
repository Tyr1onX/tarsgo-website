FROM alpine:3
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY tarsgo-backend-linux-amd64 /app/tarsgo-backend
COPY tarsgo-migrate-linux-amd64 /app/tarsgo-migrate
RUN chmod 0555 /app/tarsgo-backend /app/tarsgo-migrate
USER 10001:10001
ENTRYPOINT ["/app/tarsgo-backend"]
