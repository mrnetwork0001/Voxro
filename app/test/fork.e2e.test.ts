/**
 * End-to-end run of the app's real chain layer (src/chain/escrow.ts) against an Anvil fork of
 * X Layer mainnet with Voxro deployed by script/Deploy.s.sol. Skipped unless VOXRO_FORK=1.
 *
 *   VOXRO_FORK=1 VITE_RPC_URL=http://127.0.0.1:8572 VITE_VOXR_CPU=… VITE_VOXRO_ESCROW=… VITE_VOXRO_LENS=… \
 *   RECIPIENT_KEY=0x… SENDER_KEY=0x… pnpm --filter @voxro/app exec vitest run test/fork.e2e.test.ts
 *
 * Every write goes through the same functions the buttons call; nothing is mocked except the wallet
 * (a viem local account instead of an injected provider).
 */
import { chunkFile, deWebName, planPublish, type Address, type Hex } from '@voxro/sdk';
import { createTestClient, createWalletClient, erc20Abi, http, parseEther, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';

const RUN = process.env.VOXRO_FORK === '1';
const RPC = process.env.VITE_RPC_URL ?? 'http://127.0.0.1:8572';

describe.skipIf(!RUN)('fork e2e: register → send → decrypt → reply → claim → read reply; refund; decline; DeWEB card', () => {
  it('runs every write path of the app against the fork', async () => {
    const chain = await import('../src/chain/escrow.ts');
    const { xlayer, publicClient } = await import('../src/chain/client.ts');
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
    const bal = (a: Address) => publicClient.getBalance({ address: a });
    // exact gas paid by each mined tx, so balance checks compare value moved, not gas
    const mined: Hex[] = [];
    chain.onTxStatus((s) => s.kind === 'mined' && s.hash && mined.push(s.hash));
    const gasSince = async (from: number) => {
      let total = 0n;
      for (const h of mined.slice(from)) {
        const r = await publicClient.getTransactionReceipt({ hash: h });
        total += r.gasUsed * r.effectiveGasPrice;
      }
      return total;
    };

    // 1. recipient registers an OKB inbox: mint + tape out mailbox → open container → publishKey → registerInbox
    as(recipient);
    const steps: string[] = [];
    const handle = `e2e${Date.now() % 100000}`;
    const inbox = await chain.registerInbox(
      { handle, preset: 'balanced', curve: 'balanced', partnerCpu: null, token: 'OKB', basePrice: parseEther('0.001'), slaSeconds: 3600 },
      (s) => steps.push(`${s.key}:${s.status}`),
    );
    expect(steps).toEqual(expect.arrayContaining(['tapeout:done', 'open:done', 'key:done', 'register:done']));
    expect(inbox.handle).toBe(handle);
    expect(inbox.publicKey).not.toBe('0x');
    expect(inbox.containerCpuIndex).toBeTypeOf('number');
    console.log(`registered @${handle} inbox #${inbox.id} · ${steps.join(' ')}`);

    // 2. sender sends a Guest Express message, paying the escrow's own quote
    as(sender);
    await chain.refresh();
    const ib = chain.chainStore.get().inboxes.find((i) => i.id === inbox.id)!;
    const quote = chain.quoteFor(ib);
    expect(quote.canSend).toBe(true);
    const senderBefore = await bal(sender.address);
    const t1 = await chain.lock({ inboxId: inbox.id, subject: 'Partnership', body: 'hello from the fork' });
    expect(t1.amount).toBe(quote.price);
    expect(t1.status).toBe('Pending');
    expect(senderBefore - (await bal(sender.address))).toBeGreaterThanOrEqual(quote.price);
    console.log(`ticket #${t1.id} locked ${t1.amount} wei`);

    // 3. recipient decrypts (key derived from a signature), replies over DeWebHub, claims 95 %
    as(recipient);
    await chain.refresh();
    const ibR = chain.chainStore.get().inboxes.find((i) => i.id === inbox.id)!;
    const opened = await chain.openEnvelope(chain.chainStore.get().tickets.find((x) => x.id === t1.id)!, ibR);
    expect(opened.kind === 'message' && opened.body).toBe('hello from the fork');
    const replied = await chain.reply(t1.id, 'reply from the recipient');
    expect(replied.reply).toBeDefined();
    const check = chain.verifyClaim(chain.chainStore.get(), replied);
    expect(check.ok).toBe(true);
    // "new browser": wipe local storage — the claim must recover the reply from DeWebHub, and the
    // sender must re-derive the reply key from the wallet (step 4)
    const onChainReply = await chain.recoverReply(replied, ibR);
    expect(onChainReply?.payload).toBe(replied.reply!.payload);
    expect(onChainReply?.inboxIndex).toBe(replied.reply!.inboxIndex);
    localStorage.clear();
    const recipBefore = await bal(recipient.address);
    const mark = mined.length;
    const claimed = await chain.claim(t1.id);
    expect(claimed.status).toBe('Claimed');
    const gained = (await bal(recipient.address)) - recipBefore + (await gasSince(mark));
    expect(gained).toBe((t1.amount * 9_510n) / 10_000n); // 95 % bounty + 0.1 % keeper tip (recipient claimed it)
    expect(claimed.payout?.recipient).toBe((t1.amount * 9_500n) / 10_000n);
    console.log(`claimed: recipient +${gained} wei (bounty ${t1.amount})`);

    // 4. sender reads the reply with the guest key kept in this "browser"
    as(sender);
    await chain.refresh();
    const readBack = await chain.openReply(chain.chainStore.get().tickets.find((x) => x.id === t1.id)!);
    expect(readBack?.kind === 'message' && readBack.body).toBe('reply from the recipient');

    // 5. unanswered ticket → refund after the SLA window
    const t2 = await chain.lock({ inboxId: inbox.id, subject: '', body: 'will expire' });
    await test.increaseTime({ seconds: 3600 + 60 });
    await test.mine({ blocks: 1 });
    const beforeRefund = await bal(sender.address);
    const mark2 = mined.length;
    const refunded = await chain.refundExpired(t2.id);
    expect(refunded.status).toBe('Refunded');
    expect((await bal(sender.address)) - beforeRefund + (await gasSince(mark2))).toBe(t2.amount); // 100 % back, no fee

    // 6. recipient declines a ticket → sender refunded
    const t3 = await chain.lock({ inboxId: inbox.id, subject: '', body: 'please decline' });
    as(recipient);
    await chain.refresh();
    const senderBeforeDecline = await bal(sender.address);
    const declined = await chain.decline(t3.id);
    expect(declined.status).toBe('Refunded');
    expect((await bal(sender.address)) - senderBeforeDecline).toBe(t3.amount); // sender paid no gas for this

    // 7. DeWEB contact card: SiteRegistry files under the inbox container + DomainBinding name
    const ibCard = chain.chainStore.get().inboxes.find((i) => i.id === inbox.id)!;
    const html = `<!doctype html><title>@${handle}</title><h1>@${handle}</h1>`;
    const plan = planPublish(ibCard.container, [chunkFile({ path: '/index.html', data: new TextEncoder().encode(html) })], { fallback: '/index.html' });
    const name = deWebName(ibCard.containerTokenId, ibCard.containerCpuIndex!);
    let done = 0;
    await chain.publishCard(plan, name, ibCard, (d) => (done = d));
    expect(done).toBe(plan.calls.length + 1);
    console.log(`published tape://${name}`);

    // 8. USD₮0 inbox: ERC-20 approve → sendGuestPriority → reply → claim, exact token payouts
    const usdt0 = '0x779Ded0c9e1022225f8E0630b35a9b54bE713736' as Address;
    const tbal = (a: Address) => publicClient.readContract({ address: usdt0, abi: erc20Abi, functionName: 'balanceOf', args: [a] });
    as(recipient);
    const uInbox = await chain.registerInbox(
      { handle: `${handle}u`, preset: 'fortress', curve: 'balanced', partnerCpu: null, token: 'USDT0', basePrice: 10_000_000n, slaSeconds: 3600 },
      () => {},
    );
    expect(uInbox.token).toBe('USDT0');
    as(sender);
    await chain.refresh();
    const uq = chain.quoteFor(chain.chainStore.get().inboxes.find((i) => i.id === uInbox.id)!);
    const sBefore = await tbal(sender.address);
    const u1 = await chain.lock({ inboxId: uInbox.id, subject: 'USD₮0', body: 'stablecoin bounty' });
    expect(u1.amount).toBe(uq.price);
    expect(sBefore - (await tbal(sender.address))).toBe(uq.price);
    as(recipient);
    await chain.refresh();
    await chain.reply(u1.id, 'paid in USD₮0');
    const rBefore = await tbal(recipient.address);
    const uClaimed = await chain.claim(u1.id);
    expect(uClaimed.status).toBe('Claimed');
    expect((await tbal(recipient.address)) - rBefore).toBe((u1.amount * 9_510n) / 10_000n);
    console.log(`USD₮0 inbox #${uInbox.id}: locked ${u1.amount}, recipient +${(u1.amount * 9_510n) / 10_000n}`);

    // 10. owner controls: pricing, pause/resume, VIP allowlist
    as(recipient);
    await chain.setPricing(inbox.id, { token: 'OKB', basePrice: parseEther('0.002'), slaSeconds: 7200, curve: 'balanced' });
    let mine = chain.chainStore.get().inboxes.find((i) => i.id === inbox.id)!;
    expect(mine.basePrice).toBe(parseEther('0.002'));
    expect(mine.slaSeconds).toBe(7200);
    await chain.setActive(inbox.id, false);
    expect(chain.chainStore.get().inboxes.find((i) => i.id === inbox.id)!.active).toBe(false);
    as(sender);
    await expect(chain.lock({ inboxId: inbox.id, subject: '', body: 'while paused' })).rejects.toThrow();
    as(recipient);
    await chain.setActive(inbox.id, true);
    await chain.setAllowlist(inbox.id, [sender.address], true);
    expect(await chain.isAllowlisted(inbox.id, sender.address)).toBe(true);
    as(sender);
    await chain.refresh();
    mine = chain.chainStore.get().inboxes.find((i) => i.id === inbox.id)!;
    expect(chain.quoteFor(mine).allowlisted).toBe(true);
    console.log(`owner controls ok: price ${mine.basePrice}, sla ${mine.slaSeconds}s, allowlisted quote ${chain.quoteFor(mine).price}`);

    // 11. TapeRelay notifications (TAP-14 sealed inbox wire over the public reference relay)
    const relay = await import('../src/chain/relay.ts');
    as(recipient);
    await chain.refresh();
    const nInbox = chain.chainStore.get().inboxes.find((i) => i.id === inbox.id)!;
    const rec = await relay.enableNotifications(nInbox);
    expect(rec.inbox?.relays?.[0]?.url).toBe(relay.DEFAULT_RELAY.url);
    const readBackRec = await relay.readChannelRecord(nInbox.memberContainers[0]!, nInbox.memberIds[0]!);
    expect(readBackRec?.x25519).toBe(rec.x25519);
    const got: number[] = [];
    const stop = await relay.listenNotifications(nInbox, (n) => got.push(n.ticketId));
    as(sender);
    await chain.refresh();
    const t4 = await chain.lock({ inboxId: inbox.id, subject: '', body: 'ping over TapeRelay' });
    const sent = await relay.notifyRecipient(chain.chainStore.get().inboxes.find((i) => i.id === inbox.id)!, t4);
    expect(sent.delivered).toBe(1);
    as(recipient); // the listener refreshes state as the recipient
    for (let k = 0; k < 40 && !got.includes(t4.id); k++) await new Promise((r) => setTimeout(r, 500));
    stop();
    expect(got).toContain(t4.id);
    console.log(`TapeRelay notice for ticket #${t4.id} received via ${new URL(relay.DEFAULT_RELAY.url).host}`);

    // 9. the deploy script's flagship inbox has no key yet: its holder publishes it from the Inbox view
    const deployer = wallet(process.env.DEPLOYER_KEY as Hex);
    as(deployer);
    await chain.refresh();
    const flagship = chain.chainStore.get().inboxes.find((i) => i.handle === 'voxro');
    if (flagship && flagship.publicKey === '0x') {
      await chain.publishInboxKey(flagship);
      expect(chain.chainStore.get().inboxes.find((i) => i.handle === 'voxro')!.publicKey).not.toBe('0x');
      console.log('flagship @voxro key published');
    }
  }, 600_000);
});
