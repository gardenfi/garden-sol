FROM rust:alpine as builder

RUN apk add --no-cache git musl-dev pkgconfig libusb-dev make 
RUN git clone https://github.com/foundry-rs/foundry
RUN cd foundry/crates/anvil && cargo build --release


FROM alpine:latest

COPY --from=builder /foundry/crates/anvil/target/release/anvil .
COPY ./cmd.sh .
COPY ./ignition/data/ .

CMD ["./cmd.sh"]