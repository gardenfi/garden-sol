FROM node:latest

EXPOSE 8545:8545

WORKDIR /app

COPY package.json yarn.lock /app/
RUN yarn install

COPY . /app

CMD npx hardhat node & \
    sleep 5 && \
    if [ "$LIGHT" = "true" ]; then \
    yes | npx hardhat ignition deploy ignition/modules/lightDeploy.ts --network docker --reset; \
    else \
    yes | npx hardhat ignition deploy ignition/modules/fullDeploy.ts --network docker --reset; \
    fi && \
    tail -f /dev/null

