/**
 * TapeOut Community VIP against the REAL mainnet VoxroEscrow on a fork (skipped unless VOXRO_FORK_VIP=1):
 * register an inbox with the community rule, check a non-member pays full price, give the sender
 * 0.01 BEM (fork storage), check the escrow now quotes VIP, and toggle the rule via setVipRule.
 */
import { type Address, type Hex } from '@voxro/sdk';
import { createTestClient, createWalletClient, encodeAbiParameters, http, keccak256, parseEther, toHex, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';

const RUN = process.env.VOXRO_FORK_VIP === '1';
const RPC = process.env.VITE_RPC_URL ?? 'http://127.0.0.1:8574';
const BEM = '0x60e62Efa9405d6873C5deaBD4E6CC91c25363952' as Address;

describe.skipIf(!RUN)('fork e2e: TapeOut Community VIP on the deployed escrow', () => {
  it('quotes VIP only for community members and toggles via setVipRule', async () => {
    const chain = await import('../src/chain/escrow.ts');
    const { xlayer } = await import('../src/chain/client.ts');
    const test = createTestClient({ chain: xlayer, mode: 'anvil', transport: http(RPC) });
    const wallet = (key: Hex): { client: WalletClient; address: Address } => {
      const account = privateKeyToAccount(key);
      return { client: createWalletClient({ account, chain: xlayer, transport: http(RPC) }), address: account.address };
    };
    const recipient = wallet(process.env.RECIPIENT_KEY as Hex);
    const sender = wallet(process.env.SENDER_KEY as Hex);
    const as = (w: { client: WalletClient; address: Address }) => {
      chain.setWalletContext({ walletClient: w.client, address: w.address, chainId: 196, switchToXLayer: async () => {} });
      chain.setSender(w.address);
    };

    as(recipient);
    const handle = `vip${Date.now() % 100000}`;
    const ib = await chain.registerInbox({ handle, preset: 'balanced', curve: 'balanced', partnerCpu: null, community: true, token: 'OKB', basePrice: parseEther('0.001'), slaSeconds: 3600 }, () => {});
    expect(ib.communityVip).toBe(true);
    expect(ib.vipKind).toBe(2);

    // a fresh sender with no BEM / FAB / rigs / TapeCode NFT pays the cold price
    as(sender);
    await chain.refresh();
    const cold = chain.quoteFor(chain.chainStore.get().inboxes.find((i) => i.id === ib.id)!);
    expect(cold.vip).toBe(false);
    expect(await chain.communityEligibility(sender.address)).toEqual({ rig: false, tapecode: false, bem: false, fab: false });

    // give the sender 0.01 BEM on the fork (balances mapping is slot 5) → VIP
    const slot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [sender.address, 5n]));
    await test.setStorageAt({ address: BEM, index: slot, value: toHex(1_000_000n, { size: 32 }) });
    expect((await chain.communityEligibility(sender.address))?.bem).toBe(true);
    await chain.refresh();
    const vip = chain.quoteFor(chain.chainStore.get().inboxes.find((i) => i.id === ib.id)!);
    expect(vip.vip).toBe(true);
    expect(vip.price).toBeLessThan(cold.price);
    console.log(`community VIP: cold ${cold.price} wei → member ${vip.price} wei`);

    // owner turns the rule off, then back on (Inbox settings)
    as(recipient);
    await chain.setVipRule(ib.id, 'none');
    expect(chain.chainStore.get().inboxes.find((i) => i.id === ib.id)!.vipKind).toBe(0);
    as(sender);
    await chain.refresh();
    expect(chain.quoteFor(chain.chainStore.get().inboxes.find((i) => i.id === ib.id)!).vip).toBe(false);
    as(recipient);
    await chain.setVipRule(ib.id, 'community');
    expect(chain.chainStore.get().inboxes.find((i) => i.id === ib.id)!.communityVip).toBe(true);
  }, 300_000);
});
