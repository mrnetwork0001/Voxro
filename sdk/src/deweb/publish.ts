/** Execute a `PublishPlan` against SiteRegistry (one transaction per call, gas only) and bind a DeWEB name. */
import type { Hex, PublicClient, WalletClient } from 'viem';
import { XLAYER } from '../tapeout/addresses.js';
import type { Address } from '../tapeout/netlist.js';
import { domainBindingAbi, siteRegistryAbi } from './abi.js';
import type { PublishPlan, RegistryCall } from './manifest.js';

export interface PublishProgress {
  index: number;
  total: number;
  call: RegistryCall;
  hash: Hex;
}

/** Sends every call of the plan in order from the container holder's wallet and waits for each receipt. */
export async function publishSite(wallet: WalletClient, publicClient: PublicClient, plan: PublishPlan, onProgress?: (p: PublishProgress) => void): Promise<Hex[]> {
  const account = wallet.account;
  if (!account) throw new Error('wallet client has no account');
  const hashes: Hex[] = [];
  for (let i = 0; i < plan.calls.length; i++) {
    const call = plan.calls[i]!;
    const hash = await wallet.writeContract({
      account,
      chain: wallet.chain,
      address: plan.registry,
      abi: siteRegistryAbi,
      functionName: call.functionName,
      args: call.args as never,
    });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== 'success') throw new Error(`${call.functionName} #${i} reverted: ${hash}`);
    hashes.push(hash);
    onProgress?.({ index: i, total: plan.calls.length, call, hash });
  }
  return hashes;
}

/** `DomainBinding.bind(name, container, months)` with `msg.value = months × monthlyFee` (0 on X Layer today). */
export async function bindDomain(wallet: WalletClient, publicClient: PublicClient, name: string, container: Address, months = 120, domainBinding: Address = XLAYER.domainBinding): Promise<Hex> {
  const account = wallet.account;
  if (!account) throw new Error('wallet client has no account');
  const fee = await publicClient.readContract({ address: domainBinding, abi: domainBindingAbi, functionName: 'monthlyFee' });
  const hash = await wallet.writeContract({ account, chain: wallet.chain, address: domainBinding, abi: domainBindingAbi, functionName: 'bind', args: [name, container, BigInt(months)], value: fee * BigInt(months) });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error(`bind reverted: ${hash}`);
  return hash;
}
