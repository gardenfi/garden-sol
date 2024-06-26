FROM arm64v8/ubuntu:latest as builder

WORKDIR /app

RUN apt-get update && apt-get install -y wget --fix-missing --fix-broken

RUN wget https://github.com/foundry-rs/foundry/releases/download/nightly-32f01e3003bc4a98691282c5a03661214e3f5645/foundry_nightly_linux_arm64.tar.gz

RUN tar -xzf foundry_nightly_linux_arm64.tar.gz

# Optimal Runtime Image
FROM arm64v8/ubuntu:latest

EXPOSE 8545

WORKDIR /app

RUN apt-get update && apt-get install -y curl --fix-missing --fix-broken

COPY --from=builder /app/anvil .
COPY ./cmd.sh .
COPY ./ignition/data/ .

CMD ["./cmd.sh"]