import { exec } from "child_process";
import { IBitcoinProvider } from "@catalogfi/wallets";

export class regTestUtils {
	static async mine(blocks: number, provider: IBitcoinProvider) {
		const block = await provider.getLatestTip();
		exec(`nigiri rpc -generate ${blocks}`, (error, stdout, stderr) => {
			if (error) {
				throw error;
			}
			if (stderr) {
				throw new Error(stderr);
			}
		});
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const newBlock = await provider.getLatestTip();
			if (newBlock > block) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
	/**
	 * funds the address with 1 BTC
	 */
	static async fund(address: string, provider: IBitcoinProvider) {
		const balance = await provider.getBalance(address);
		exec(`nigiri faucet ${address}`, async (error, stdout, stderr) => {
			if (error) {
				throw error;
			}
			if (stderr) {
				throw new Error(stderr);
			}
			await this.mine(10, provider);
		});
		while ((await provider.getBalance(address)) === balance) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}

	static async generateAddress() {
		return new Promise<string>((resolve, reject) => {
			exec('nigiri rpc getnewaddress "" "bech32"', (error, stdout, stderr) => {
				if (error) {
					reject(error);
				}
				if (stderr) {
					reject(new Error(stderr));
				}
				resolve(stdout);
			});
		});
	}
}
