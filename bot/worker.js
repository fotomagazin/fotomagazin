// Фотомагазин — бот обратной связи (Cloudflare Worker).
//
// Что умеет:
//  • люди пишут боту в Telegram — сообщения (текст, скриншоты, файлы) приходят владельцу;
//    владелец отвечает «Ответить» на сообщении — бот пересылает ответ человеку;
//  • форма отзыва в программе и на сайте шлёт POST /feedback — отзыв приходит владельцу в Telegram;
//  • GET /downloads — сколько раз скачали программу с GitHub (запасной путь для счётчика на сайте).
//
// Секреты (задаются командой `wrangler secret put`, в коде их нет):
//  BOT_TOKEN       — токен бота от @BotFather;
//  WEBHOOK_SECRET  — пароль, которым Telegram подписывает запросы к боту;
//  CLAIM_CODE      — одноразовый код: владелец пишет боту `/claim КОД`, и бот запоминает его.
// Хранилище KV: владелец, связи «сообщение у владельца → кто его написал», ограничение частоты.

const TG = (env, method, body) =>
  fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json());

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const MONTH = 60 * 60 * 24 * 30;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/feedback' && req.method === 'POST') return feedback(req, env);
    if (url.pathname === '/downloads') return downloads(env);
    if (url.pathname === '/telegram' && req.method === 'POST') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      try { await onUpdate(await req.json(), env); } catch (e) { console.error(e); }
      return new Response('ok');   // Telegram всегда получает «ok», иначе будет слать повторы
    }
    if (url.pathname === '/setup' && url.searchParams.get('key') === env.WEBHOOK_SECRET) return setup(url, env);
    return new Response('Фотомагазин — бот обратной связи', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};

// подключить бота к этому серверу (вызывается один раз после установки токена)
async function setup(url, env) {
  const hook = await TG(env, 'setWebhook', {
    url: `${url.origin}/telegram`, secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message'], drop_pending_updates: true,
  });
  await TG(env, 'setMyCommands', { commands: [{ command: 'start', description: 'Как написать автору' }] });
  const me = await TG(env, 'getMe', {});
  return json({ webhook: hook, bot: me.result && me.result.username, owner: !!(await env.KV.get('owner')) });
}

// ---------- сообщения в Telegram ----------
async function onUpdate(u, env) {
  const m = u.message; if (!m || m.chat.type !== 'private') return;
  const owner = await env.KV.get('owner'), from = m.from || {}, text = m.text || '';

  if (text.startsWith('/claim')) {   // владелец «забирает» бота кодом
    if (owner) return TG(env, 'sendMessage', { chat_id: m.chat.id, text: owner === String(m.chat.id) ? 'Вы уже владелец бота ✅' : 'У бота уже есть владелец.' });
    if (text.split(/\s+/)[1] !== env.CLAIM_CODE) return TG(env, 'sendMessage', { chat_id: m.chat.id, text: 'Неверный код.' });
    await env.KV.put('owner', String(m.chat.id));
    return TG(env, 'sendMessage', { chat_id: m.chat.id, text: '✅ Готово! Теперь все отзывы — из Telegram, из программы и с сайта — будут приходить сюда.\n\nЧтобы ответить человеку, нажмите «Ответить» на его сообщении — бот перешлёт ответ.' });
  }

  if (owner && String(m.chat.id) === owner) {   // пишет владелец
    if (m.reply_to_message) {
      const to = await env.KV.get('map:' + m.reply_to_message.message_id);
      if (!to) return TG(env, 'sendMessage', { chat_id: owner, text: 'На это сообщение ответить нельзя: оно пришло из формы на сайте или в программе. Если человек оставил контакт — напишите ему напрямую.', reply_to_message_id: m.message_id });
      const r = await TG(env, 'copyMessage', { chat_id: to, from_chat_id: owner, message_id: m.message_id });
      return r.ok ? TG(env, 'setMessageReaction', { chat_id: owner, message_id: m.message_id, reaction: [{ type: 'emoji', emoji: '👍' }] })
        : TG(env, 'sendMessage', { chat_id: owner, text: 'Не удалось доставить ответ: ' + (r.description || 'ошибка'), reply_to_message_id: m.message_id });
    }
    if (text === '/start') return TG(env, 'sendMessage', { chat_id: owner, text: 'Вы владелец бота. Отзывы приходят сюда. Чтобы ответить человеку — «Ответить» на его сообщении.' });
    return TG(env, 'sendMessage', { chat_id: owner, text: 'Чтобы ответить человеку, нажмите «Ответить» на его сообщении.' });
  }

  if (text === '/start') return TG(env, 'sendMessage', { chat_id: m.chat.id,
    text: 'Привет! Это бот Фотомагазина 👋\n\nНапишите идею, опишите ошибку или пришлите скриншот — сообщение получит автор и ответит здесь же.' });
  if (!owner) return TG(env, 'sendMessage', { chat_id: m.chat.id, text: 'Бот ещё настраивается — попробуйте чуть позже.' });

  // сообщение от человека → владельцу, с подписью «кто написал»
  const who = esc([from.first_name, from.last_name].filter(Boolean).join(' ') || 'Без имени') + (from.username ? ' · @' + esc(from.username) : '');
  const head = `💬 <b>${who}</b>`;
  const media = m.photo || m.document || m.video || m.audio || m.voice || m.animation;
  const sent = [];
  if (m.text) sent.push(await TG(env, 'sendMessage', { chat_id: owner, text: `${head}\n\n${esc(m.text)}`, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }));
  else if (media) sent.push(await TG(env, 'copyMessage', { chat_id: owner, from_chat_id: m.chat.id, message_id: m.message_id, parse_mode: 'HTML',
    caption: (head + (m.caption ? '\n\n' + esc(m.caption) : '')).slice(0, 1000) }));
  else { sent.push(await TG(env, 'sendMessage', { chat_id: owner, text: head, parse_mode: 'HTML' }));
    sent.push(await TG(env, 'copyMessage', { chat_id: owner, from_chat_id: m.chat.id, message_id: m.message_id })); }
  for (const r of sent) if (r.ok) await env.KV.put('map:' + r.result.message_id, String(m.chat.id), { expirationTtl: MONTH });

  if (!(await env.KV.get('ack:' + m.chat.id))) {   // «получено» — не чаще раза в час, чтобы не мешать
    await env.KV.put('ack:' + m.chat.id, '1', { expirationTtl: 3600 });
    await TG(env, 'sendMessage', { chat_id: m.chat.id, text: '✓ Получено! Автор прочитает и ответит здесь.' });
  }
}

// ---------- форма отзыва из программы и с сайта ----------
const KIND = { idea: '💡 Идея', bug: '🐞 Ошибка', other: '💬 Сообщение' };
async function feedback(req, env) {
  let d; try { d = JSON.parse(await req.text()); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  if (d.website) return json({ ok: true });   // ловушка для спам-ботов: людям это поле не видно
  const text = String(d.text || '').trim().slice(0, 3000);
  if (text.length < 3) return json({ ok: false, error: 'empty' }, 400);
  const owner = await env.KV.get('owner'); if (!owner) return json({ ok: false, error: 'not configured' }, 503);

  const ip = req.headers.get('cf-connecting-ip') || 'x', key = 'rl:' + ip, n = +(await env.KV.get(key) || 0);   // не больше 5 отзывов за 10 минут
  if (n >= 5) return json({ ok: false, error: 'rate' }, 429);
  await env.KV.put(key, String(n + 1), { expirationTtl: 600 });

  const src = d.source === 'site' ? 'с сайта' : 'из программы';
  const lines = [`<b>${KIND[d.type] || KIND.other}</b> · ${src}`, '', esc(text)];
  if (d.diag) lines.push('', `<i>${esc(String(d.diag).slice(0, 300))}</i>`);
  if (d.contact) lines.push('', 'Контакт: ' + esc(String(d.contact).slice(0, 100)));
  const r = await TG(env, 'sendMessage', { chat_id: owner, text: lines.join('\n'), parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  return r.ok ? json({ ok: true }) : json({ ok: false, error: 'telegram' }, 502);
}

// ---------- счётчик скачиваний: сумма по всем релизам на GitHub, кэш на 15 минут ----------
async function downloads(env) {
  const cached = JSON.parse(await env.KV.get('dl') || 'null');
  if (cached && Date.now() - cached.t < 15 * 60 * 1000) return json({ count: cached.n });
  try {
    const r = await fetch('https://api.github.com/repos/fotomagazin/fotomagazin/releases?per_page=100',
      { headers: { 'user-agent': 'fotomagazin-bot', accept: 'application/vnd.github+json' } });
    if (!r.ok) throw Error('github ' + r.status);
    const n = (await r.json()).reduce((s, rel) => s + rel.assets.reduce((a, x) => a + x.download_count, 0), 0);
    await env.KV.put('dl', JSON.stringify({ n, t: Date.now() }));
    return json({ count: n });
  } catch (e) {   // GitHub не ответил — отдаём последнее известное число
    return cached ? json({ count: cached.n, stale: true }) : json({ count: null }, 503);
  }
}
