import { XLAYER, bytesToHex, deWebHubAbi, deriveKeyPair, keyDerivationText, type Address } from '@voxro/sdk';
import { createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayer } from 'viem/chains';
import { CliError, bold, client, dim, green, isAddress, num, rpcUrl, type Flags } from '../util.js';

/**
 * voxro key derive|publish <0xcircuits> <tokenId> --cpu-index <n>
 * Derives the TapeSend X25519 key for a container from a wallet signature over the Voxro key text
 * (EIP-4361, domain voxro.shieldsuite.xyz) and publishes it to DeWebHub. The secret never leaves the process.
 */
export async function key(f: Flags): Promise<void> {
  const sub = f._[1];
  const circuits = f._[2];
  const tokenId = f._[3];
  if (!sub || !circuits || !tokenId || !isAddress(circuits) || !/^\d+$/.test(tokenId)) {
    throw new CliError('usage: voxro key derive|publish <0xcircuits> <tokenId> --cpu-index <n> [--app voxro|tapesend]   (signer: VOXRO_PRIVATE_KEY)');
  }
  const cpuIndex = num(f, 'cpu-index', -1);
  if (cpuIndex < 0) throw new CliError('--cpu-index <factory index of the processor> is required (it is part of the signed text)');
  const pk = process.env.VOXRO_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new CliError('VOXRO_PRIVATE_KEY env var is required');
  const account = privateKeyToAccount(pk as Hex);
  const pc = client(f);
  const view = await pc.readContract({ address: XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'keyFor', args: [circuits, BigInt(tokenId)] });
  if (view.current.toLowerCase() !== account.address.toLowerCase()) throw new CliError(`signer ${account.address} does not hold #${tokenId} (holder ${view.current})`);
  const app = (f.app as string | undefined) === 'tapesend' ? 'tapesend' : 'voxro';
  const params = { tokenId: BigInt(tokenId), cpuIndex: BigInt(cpuIndex), container: view.container as Address, holder: account.address, hub: XLAYER.deWebHub, chainId: 196, keyIndex: 0 };
  const text = keyDerivationText(params, app);
  const signature = await account.signMessage({ message: text });
  const kp = deriveKeyPair({ ...params, signature, app });
  console.log(bold(`container ${view.container}`), dim(`opened ${view.opened} · usable ${view.usable} · version ${view.version}`));
  console.log(`  X25519 public key ${bytesToHex(kp.publicKey)}`);
  if (sub === 'derive') return;
  if (sub !== 'publish') throw new CliError(`unknown subcommand ${sub}`);
  if (!view.opened) throw new CliError('container is not opened yet (Opener.open, 0.08 OKB)');
  const wc = createWalletClient({ account, chain: xLayer, transport: http(rpcUrl(f)) });
  const hash = await wc.writeContract({ address: XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'publishKey', args: [circuits, BigInt(tokenId), 1, 0, bytesToHex(kp.publicKey), 4n] });
  const r = await pc.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new CliError(`publishKey reverted: ${hash}`);
  const after = await pc.readContract({ address: XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'keyFor', args: [circuits, BigInt(tokenId)] });
  console.log(green('published'), dim(`tx ${hash}`), `usable ${after.usable} · chains ${after.chains.toString(16)}`);
}
