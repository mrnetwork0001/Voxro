#!/usr/bin/env bash
# Start an Anvil fork of X Layer with a pinned block, wait until it answers, run the fork rehearsal
# test-suite against it, then stop Anvil.
# Why pin the block: with `--fork-url` alone Anvil forks at 'latest' without a disk cache, and on the
# public X Layer RPC we saw accepted transactions sit unmined for minutes while Anvil waited on
# upstream state fetches. A pinned block enables ~/.foundry/cache and the bounded --timeout/--retries
# make a bad upstream fail fast instead of hanging the suite.
#   UPSTREAM=https://xlayerrpc.okx.com ./scripts/fork-test.sh
set -uo pipefail
UPSTREAM=${UPSTREAM:-https://rpc.xlayer.tech}
PORT=${PORT:-8545}
LOG=${LOG:-/tmp/voxro-anvil-fork.log}
LATEST=$(cast block-number -r "$UPSTREAM")
BLOCK=${BLOCK:-$((LATEST - 20))}
echo "upstream=$UPSTREAM latest=$LATEST pinned=$BLOCK port=$PORT"
anvil --fork-url "$UPSTREAM" --fork-block-number "$BLOCK" --port "$PORT" --no-rate-limit --timeout 20000 --retries 2 > "$LOG" 2>&1 &
APID=$!
trap 'kill $APID 2>/dev/null; wait $APID 2>/dev/null' EXIT
for i in $(seq 1 60); do
  if cast chain-id -r "http://127.0.0.1:$PORT" >/dev/null 2>&1; then echo "anvil ready after ${i}s"; break; fi
  sleep 1
done
VOXRO_FORK_RPC="http://127.0.0.1:$PORT" pnpm vitest run test/fork.test.ts --testTimeout=600000 --hookTimeout=600000
STATUS=$?
echo "--- anvil mined txs: $(grep -c 'Transaction:' "$LOG") ; errors: $(grep -ciE 'error|warn' "$LOG") ; log: $LOG"
exit $STATUS
