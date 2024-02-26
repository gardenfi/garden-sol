export const lzEndpointsMainnet: Record<string, string> = {
  ethereum: "0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675",
  arbitrum: "0x3c2269811836af69497E5F486A85D7316753cf62",
};

export const lzEndpointsTestnet: Record<string, string> = {
  ethereum_sepolia: "0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1", // sepolia eth mainnet
  arbitrum_sepolia: "0x6098e96a28E02f27B1e6BD381f870F1C8Bd169d3", // arbitrum sepolia
};

export const sleep = async (ms: number) =>
  new Promise((r) => setTimeout(r, ms));
