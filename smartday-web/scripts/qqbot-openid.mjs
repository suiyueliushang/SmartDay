#!/usr/bin/env node
// ============================================================
// QQ 官方机器人 · openid 一键获取工具
// 用法： node qqbot-openid.mjs <AppID> <AppSecret> [--verbose]
// 原理：
//   ① AppID+AppSecret 换 access_token
//   ② 取网关地址并建立 WebSocket 连接，订阅消息事件
//   ③ 你给机器人发一条消息（或把机器人拉进群 @ 它一次）
//   ④ 脚本打印出 user_openid / group_openid，复制到 SmartDay 推送设置即可
// 需求：Node.js 18+（用全局 fetch / WebSocket，Node 22+ 自带 WebSocket）
// ============================================================

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const VERBOSE = process.argv.includes('--verbose');
const [APPID, SECRET] = args;

if (!APPID || !SECRET) {
  console.log('用法: node qqbot-openid.mjs <AppID> <AppSecret> [--verbose]');
  console.log('提示: AppID/AppSecret 在 QQ 开放平台 → 机器人 → 开发设置 → AppID 接入凭证');
  console.log('      密钥可能只完整显示一次；如已脱敏，请点「重置」后再复制完整值。');
  process.exit(1);
}

const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
const API_BASE = 'https://api.sgroup.qq.com';
// 群聊与单聊消息事件需要的 intent（GROUP_AND_C2C_EVENT）；再加上频道公域消息，便于验证权限
const INTENTS = (1 << 25) | (1 << 30);

const seen = new Set();

async function getToken() {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId: APPID, clientSecret: SECRET }),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  if (!json || !json.access_token) {
    const code = json && json.code;
    console.error('❌ 获取 access_token 失败：', text.slice(0, 200));
    if (code === 100016) console.error('   → AppID 或 AppSecret 无效：请到后台重新复制「完整」密钥（页面显示的可能是脱敏值，或点重置后用新值）。');
    if (code === 100007) console.error('   → 凭据相关错误：确认 AppID 与该机器人的 Secret 是同一套。');
    process.exit(1);
  }
  console.log('✅ 已获取 access_token，有效期约', json.expires_in, '秒');
  return json.access_token;
}

async function getGateway(token) {
  const r = await fetch(API_BASE + '/gateway', { headers: { Authorization: 'QQBot ' + token } });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  if (!json) throw new Error('GET /gateway 返回异常: ' + text.slice(0, 200));
  return json.url;
}

function printOpenids(evt) {
  const d = evt.d || {};
  const author = d.author || {};
  const type = evt.t;
  if (type === 'C2C_MESSAGE_CREATE') {
    const id = author.user_openid;
    console.log('');
    console.log('💬 收到【单聊】消息:', JSON.stringify(d.content || ''));
    console.log('   ✅ 你的 user_openid（填 SmartDay「目标 openid」）：');
    console.log('      ' + id);
    console.log('   （msg_id 供被动回复用：' + (d.id || '') + '）');
    seen.add('user:' + id);
    return;
  }
  if (type === 'GROUP_AT_MESSAGE_CREATE') {
    console.log('');
    console.log('👥 收到【群】@消息:', JSON.stringify(d.content || ''));
    console.log('   ✅ 群 group_openid（填 SmartDay 并选「群」）：');
    console.log('      ' + d.group_openid);
    console.log('   （群成员 member_openid：' + (author.member_openid || '') + '）');
    seen.add('group:' + d.group_openid);
    return;
  }
  if (type && /MESSAGE_CREATE$/.test(type)) {
    console.log('ℹ️ 收到其它消息事件', type, VERBOSE ? JSON.stringify(d) : '');
    if (d.group_openid) seen.add('group:' + d.group_openid);
    if (author.user_openid) seen.add('user:' + author.user_openid);
  }
}

async function main() {
  const token = await getToken();
  let url;
  try {
    url = await getGateway(token);
  } catch (e) {
    console.error('❌ 获取网关地址失败：', String(e.message || e).slice(0, 200));
    process.exit(1);
  }
  console.log('🌐 连接网关:', url);

  const ws = new WebSocket(url);
  let seq = null;
  let hbTimer = null;

  ws.addEventListener('open', () => console.log('🔌 已连接，正在握手…'));
  ws.addEventListener('error', (e) => console.error('❌ WebSocket 错误:', String(e.message || e).slice(0, 200)));
  ws.addEventListener('close', (e) => {
    console.log('🔚 连接关闭 code=' + e.code + ' reason=' + (e.reason || ''));
    if (hbTimer) clearInterval(hbTimer);
    if (seen.size) {
      console.log('');
      console.log('本次发现的 openid：');
      for (const s of seen) console.log('  ' + s);
    }
  });

  ws.addEventListener('message', (ev) => {
    let msg = null;
    try { msg = JSON.parse(String(ev.data)); } catch { return; }
    if (msg.s != null) seq = msg.s;
    if (msg.op === 10) {
      // Hello：按平台要求的心跳间隔发 op 1，并发送 op 2 鉴权
      const interval = (msg.d && msg.d.heartbeat_interval) || 40000;
      hbTimer = setInterval(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ op: 1, d: seq }));
      }, interval);
      ws.send(JSON.stringify({
        op: 2,
        d: {
          token: 'QQBot ' + token,
          intents: INTENTS,
          shard: [0, 1],
          properties: { $os: process.platform, $browser: 'smartday-openid-tool', $device: 'smartday' },
        },
      }));
      return;
    }
    if (msg.op === 0 && msg.t === 'READY') {
      const user = (msg.d && msg.d.user) || {};
      console.log('🤖 鉴权成功，机器人：', user.username || '(未知)');
      console.log('');
      console.log('👉 现在用你的 QQ 给这个机器人发一条消息（群场景：把机器人拉进群并 @ 它一次）');
      console.log('   发完立刻就能看到下面打印出的 openid，复制到 SmartDay 推送设置里即可。');
      console.log('   （脚本会一直挂着，Ctrl+C 退出）');
      return;
    }
    if (msg.op === 0 && msg.t) {
      if (VERBOSE) console.log('[event]', msg.t);
      printOpenids(msg);
      return;
    }
    if (msg.op === 9) {
      console.error('❌ 鉴权失败（op 9）：intents 可能未被平台允许，或 token 失效。原始：', JSON.stringify(msg.d).slice(0, 300));
      console.error('   → 可先在后台「沙箱/调试」确认机器人已开通群与单聊消息能力。');
    }
  });
}

main().catch((e) => { console.error('❌ 运行失败：', String(e && e.message || e).slice(0, 300)); process.exit(1); });