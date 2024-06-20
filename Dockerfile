FROM node:latest

WORKDIR /app

COPY package.json yarn.lock /app/
RUN yarn install

COPY . /app

CMD npx hardhat node & \
    sleep 5 && \
    if [ "$LIGHT" = "true" ]; then \
    npx hardhat ignition deploy ignition/modules/lightDeploy.ts --network docker ; \
    else \
    npx hardhat ignition deploy ignition/modules/fullDeploy.ts --network docker ; \
    fi && \
    tail -f /dev/null

EXPOSE 8545:8545
