import { CodexRpc } from '../server/rpc.mjs';
const rpc = new CodexRpc();
try {
  await rpc.connect();
  const account = await rpc.call('account/read', { refreshToken: false });
  const list = await rpc.call('thread/list', { limit: 5, sortKey: 'updated_at', modelProviders: [], sourceKinds: ['cli', 'vscode', 'appServer', 'exec'], useStateDbOnly: true });
  const models = await rpc.call('model/list', {});
  console.log(JSON.stringify({ connected: true, accountType: account.account?.type, plan: account.account?.planType, threadCount: list.data.length, hasMore: !!list.nextCursor, models: models.data?.map(m => ({ id: m.id, model: m.model, isDefault: m.isDefault })) }, null, 2));
  if (list.data[0]) {
    const history = await rpc.call('thread/turns/list', { threadId: list.data[0].id, limit: 2, itemsView: 'full', sortDirection: 'desc' });
    console.log(JSON.stringify({ historyReadable: true, turnCount: history.data?.length, hasMore: !!history.nextCursor }, null, 2));
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { rpc.close(); }
