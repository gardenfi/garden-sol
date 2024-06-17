export const htlcErrors = {
	secretMismatch: "invalid secret",
	secretHashLenMismatch: "secret hash should be 32 bytes",
	pubkeyLenMismatch: "pubkey should be 32 bytes",
	zeroOrNegativeExpiry: "expiry should be greater than 0",
	htlcAddressGenerationFailed: "failed to generate htlc address",
	notFunded: "address not funded",
	noCounterpartySigs: "counterparty signatures are required",
	counterPartySigNotFound: (utxo: string) =>
		"counterparty signature not found for utxo " + utxo,
	invalidCounterpartySigForUTXO: (utxo: string) =>
		"invalid counterparty signature for utxo " + utxo,
	htlcNotExpired: (blocks: number) => `HTLC not expired, need more ${blocks} blocks`,

	invalidLeaf: "invalid leaf",
};
