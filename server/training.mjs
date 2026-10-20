export const trainingThread = { id: 'training', name: '消失的登录状态', cwd: '本地演练 · 不消耗 Codex 额度', model: '本地演练', modelProvider: 'training', createdAt: 1792454400, updatedAt: 1792454400, status: { type: 'idle' } };
export const trainingTurns = [{ id: 'training-turn', status: 'completed', items: [
  { type: 'userMessage', id: 'training-user', content: [{ type: 'text', text: '页面刷新后总是退出登录。你认为问题出在哪里？' }] },
  { type: 'agentMessage', id: 'training-answer', phase: 'final', text: '根据目前的现象，我认为可以从以下三个方面排查。\n\n**01 · 初步判断**\n登录状态丢失是浏览器缓存导致的，清除缓存就能解决。\n\n**02 · 当前依据**\n页面刷新后会重新读取本地状态，如果缓存中的用户数据过期，就可能触发退出。\n\n**03 · 下一步**\n先清除缓存，再重新登录，观察刷新后的结果。' }
] }];
export const trainingEvidence = { title: '清除缓存后的复现日志', kind: 'text', source: '本地演练 · 示例日志', content: '10:24:01  浏览器缓存已清除，使用全新用户目录\n10:24:08  POST /login → 200 OK\n10:24:08  Set-Cookie: session=example; Secure; SameSite=None\n10:24:12  GET http://localhost:3000/me → 401 Unauthorized\n10:24:12  Request Cookie: (empty)\n\n复现结果：清除缓存后，刷新仍然退出登录。' };
export function trainingReply(action, text, hasEvidence) {
  if (action === 'object' || action === 'present') return hasEvidence
    ? '**复核结论 · 原判断需要修正**\n\n这份证据显示：使用全新用户目录清除缓存后，问题依然存在。因此，“清除缓存就能解决”这一确定性结论缺乏依据。\n\n**证据与解释**\n日志中的刷新请求没有携带 Cookie，但仅凭这一点，还不能确定 Cookie 缺失的原因。接下来应核对浏览器中的 Cookie 保存结果、Domain / Path、凭据配置和实际请求地址。\n\n**修正后的表述**\n登录状态丢失的原因尚未确认。现有日志提示认证 Cookie 没有随刷新请求发出，应优先沿这一方向验证。\n\n*本段为预设演练回复，未调用模型、未执行实际检查。*'
    : '**复核结论 · 需要更多依据**\n\n你的异议已记录。“清除缓存就能解决”的表述过于确定，但目前还没有足够证据确定真正原因。请出示复现日志，或说明反例发生的条件。\n\n*这是预设演练回复。*';
  if (action === 'press') return '**复核结论 · 这是推测，尚未验证**\n\n目前只观察到了“刷新后退出登录”，它不能单独证明是缓存问题。Cookie、请求凭据和服务端会话都可能影响登录状态。\n\n**需要追查的依据**\n1. 刷新请求是否带上认证 Cookie？\n2. 服务端返回的状态码是什么？\n3. 使用全新浏览器目录是否仍能复现？\n\n*这是预设演练回复，真实会话会交给你的 Codex 处理。*';
  if (action === 'verify') return '**验证计划**\n\n这是一场本地演练，我没有执行命令。真实会话中，Codex 会在你的权限设置下运行检查，并将命令及结果显示在「执行记录」中。\n\n可以验证：清除缓存前后是否都复现、请求是否携带 Cookie、服务端会话是否仍然有效。';
  return '**已收到你的陈述**\n\n这里是本地演练庭，不会调用模型。你可以点选前面的任意证言，点击「追问」；也可以在右侧添加证据后「提出异议」。\n\n进入左侧已有会话，即可使用真正的 Codex。';
}
