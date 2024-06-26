#!/bin/sh

./anvil --host 0.0.0.0 &

sleep 3 

if [ -n "$CHAIN_ID" ]; then
    response=$(curl -s -X POST -H "Content-Type: application/json" --data "{\"jsonrpc\":\"2.0\", \"method\":\"anvil_setChainId\", \"params\":[$CHAIN_ID], \"id\":1}" http://localhost:8545)
    echo "Set chain ID response: $response"
else
    echo "CHAIN_ID is not set, default chain ID is 31337."
fi

if [ "$LIGHT" = "true" ]; then
    state_file="./lightState.json"
else
    state_file="./fullState.json"
fi

response=$(curl -s -X POST -H "Content-Type: application/json" --data-binary @$state_file http://localhost:8545)
echo "Set blockchain state response: $response"

tail -f /dev/null