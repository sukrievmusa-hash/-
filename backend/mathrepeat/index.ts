// Мат-повтор: сервер напоминаний в Telegram (Supabase Edge Function).
// Маршруты:
//   GET  /info   — имя бота для сайта
//   POST /sync   — сайт присылает расписание карточек подключённого устройства
//   POST /bot    — вебхук Telegram (команды /start, /time, /status, /stop, /on)
//   POST /cron   — раз в час: разослать напоминания тем, у кого наступило их время
//   POST /setup  — один раз после добавления токена: вебхук + список команд
// Функция деплоится с verify_jwt = false: /bot и /cron проверяют свои секреты,
// /sync меняет только строку с известным случайным device_id.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20 });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HOURS = [[7, 8, 12, 15], [18, 19, 20, 21], [22, 23]];

let cfgCache: Record<string, string> = {};
let cfgAt = 0;
async function cfg(fresh = false) {
  if (!fresh && Date.now() - cfgAt < 60_000) return cfgCache;
  const rows = await sql`select key, value from mathrepeat.config`;
  cfgCache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cfgAt = Date.now();
  return cfgCache;
}

async function tg(method: string, body: unknown) {
  const c = await cfg();
  if (!c.bot_token) return { ok: false, error_code: 0, description: "no bot token" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${c.bot_token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error_code: 0, description: String(e) };
  }
}

const cards = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? "карточка"
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "карточки" : "карточек";
const days = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? "день"
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "дня" : "дней";
const hh = (h: number) => String(h).padStart(2, "0") + ":00";
const minutes = (n: number) => Math.max(1, Math.round(n * 0.5)); // около 30 секунд на карточку

const playButton = (site: string) => ({ inline_keyboard: [[{ text: "▶ Повторить сейчас", url: site + "#go" }]] });
const hourKeyboard = () => ({ inline_keyboard: HOURS.map((row) => row.map((h) => ({ text: hh(h), callback_data: "h:" + h }))) });

// ---------- сайт -> сервер ----------
async function sync(b: Record<string, unknown>) {
  const id = String(b.id ?? "");
  if (!UUID.test(id)) return json({ error: "bad id" }, 400);
  if (b.unlink) {
    await sql`delete from mathrepeat.users where device_id = ${id}::text`;
    return json({ linked: false });
  }
  const now = Math.floor(Date.now() / 1000);
  const due = (Array.isArray(b.due) ? b.due : []).slice(0, 5000)
    .map((x) => Math.floor(Number(x))).filter((x) => Number.isFinite(x) && x > 0 && x < now + 20 * 365 * 86400);
  const int = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const lastDay = typeof b.lastDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.lastDay) ? b.lastDay : null;
  const weak = typeof b.weak === "string" && b.weak ? b.weak.slice(0, 120) : null;
  // строку создаёт только бот по команде /start, сайт может лишь обновить уже подключённую
  const rows = await sql`
    update mathrepeat.users set
      due_times = string_to_array(${due.join(",")}::text, ',')::int[],
      tz_offset_min = ${int(b.tz, -720, 840, 300)}::int,
      unseen = ${int(b.unseen, 0, 100000, 0)}::int,
      new_per_day = ${int(b.newPerDay, 0, 200, 15)}::int,
      weak = ${weak}::text,
      streak = ${int(b.streak, 0, 100000, 0)}::int,
      last_study_day = ${lastDay}::date,
      updated_at = now()
    where device_id = ${id}::text and chat_id is not null
    returning remind_hour`;
  return json(rows.length ? { linked: true, hour: rows[0].remind_hour } : { linked: false });
}

// ---------- Telegram -> сервер ----------
// deno-lint-ignore no-explicit-any
async function onUpdate(u: any) {
  const c = await cfg();
  const site = c.site_url || "";

  if (u.callback_query) {
    const q = u.callback_query;
    const chat = q.message?.chat?.id;
    const m = /^h:(\d{1,2})$/.exec(q.data || "");
    if (chat && m && Number(m[1]) <= 23) {
      const h = Number(m[1]);
      const r = await sql`update mathrepeat.users set remind_hour = ${h}::int, enabled = true where chat_id = ${chat}::bigint returning device_id`;
      await tg("answerCallbackQuery", { callback_query_id: q.id, text: r.length ? "Готово" : "Сначала подключите сайт" });
      if (r.length) {
        await tg("editMessageText", { chat_id: chat, message_id: q.message.message_id, text: `⏰ Буду напоминать каждый день в ${hh(h)}, если есть что повторить.` });
      }
    } else {
      await tg("answerCallbackQuery", { callback_query_id: q.id });
    }
    return;
  }

  const msg = u.message;
  if (!msg || typeof msg.text !== "string" || msg.chat?.type !== "private") return;
  const chat = msg.chat.id;
  const [cmd, arg] = msg.text.trim().split(/\s+/);
  const command = cmd.split("@")[0].toLowerCase();
  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ").slice(0, 80) || null;
  const mine = () => sql`
    select remind_hour, enabled, unseen, new_per_day, weak,
      (select count(*)::int from unnest(due_times) t where t <= extract(epoch from now())) as due
    from mathrepeat.users where chat_id = ${chat}::bigint limit 1`;
  const notLinked = () => tg("sendMessage", {
    chat_id: chat,
    text: "Чтобы я напоминал о повторении, откройте сайт → «Настройки» → «Подключить Telegram».",
    reply_markup: { inline_keyboard: [[{ text: "Открыть сайт", url: site }]] },
  });

  if (command === "/start") {
    if (arg && UUID.test(arg)) {
      await sql`delete from mathrepeat.users where chat_id = ${chat}::bigint and device_id <> ${arg}::text`;
      const r = await sql`
        insert into mathrepeat.users (device_id, chat_id, tg_name) values (${arg}::text, ${chat}::bigint, ${name}::text)
        on conflict (device_id) do update set chat_id = excluded.chat_id, tg_name = excluded.tg_name, enabled = true
        returning remind_hour`;
      await tg("sendMessage", {
        chat_id: chat,
        text: `✅ Подключено!\n\nКаждый день в ${hh(r[0].remind_hour)} напишу, сколько карточек пора повторить и какая тема проседает. Если уже позанимались или повторять нечего, не побеспокою.\n\nВыберите удобное время:`,
        reply_markup: hourKeyboard(),
      });
      await tg("sendMessage", { chat_id: chat, text: "Теперь вернитесь на сайт: он передаст мне расписание ваших карточек.", reply_markup: { inline_keyboard: [[{ text: "Вернуться на сайт", url: site }]] } });
    } else {
      const r = await mine();
      if (r.length) await tg("sendMessage", { chat_id: chat, text: `Вы уже подключены, напоминаю в ${hh(r[0].remind_hour)}.\n/time — изменить время\n/status — сколько карточек ждёт\n/stop — выключить напоминания` });
      else await notLinked();
    }
    return;
  }

  const r = await mine();
  if (!r.length) return void (await notLinked());
  const me = r[0];

  if (command === "/time") {
    await tg("sendMessage", { chat_id: chat, text: `Сейчас напоминаю в ${hh(me.remind_hour)}. Выберите новое время:`, reply_markup: hourKeyboard() });
  } else if (command === "/stop") {
    await sql`update mathrepeat.users set enabled = false where chat_id = ${chat}::bigint`;
    await tg("sendMessage", { chat_id: chat, text: "Напоминания выключены. Включить снова: /on" });
  } else if (command === "/on") {
    await sql`update mathrepeat.users set enabled = true where chat_id = ${chat}::bigint`;
    await tg("sendMessage", { chat_id: chat, text: `Напоминания включены, пишу в ${hh(me.remind_hour)}.` });
  } else if (command === "/status") {
    const total = me.due + Math.min(me.new_per_day, me.unseen);
    const text = total
      ? `Сейчас ждёт ${total} ${cards(total)}: это примерно ${minutes(total)} мин.` + (me.weak ? `\n🎯 Слабая тема: ${me.weak}` : "")
      : "Сейчас повторять нечего 👍";
    await tg("sendMessage", { chat_id: chat, text, reply_markup: playButton(site) });
  } else {
    await tg("sendMessage", { chat_id: chat, text: "Команды:\n/status — сколько карточек ждёт\n/time — время напоминания\n/stop — выключить\n/on — включить" });
  }
}

// ---------- раз в час ----------
async function cron() {
  const c = await cfg(true);
  if (!c.bot_token) return json({ sent: 0, note: "no bot token" });
  const site = c.site_url || "";
  const rows = await sql`
    with u as (
      select *, ((now() at time zone 'utc') + make_interval(mins => tz_offset_min)) as local_ts
      from mathrepeat.users where chat_id is not null and enabled
    )
    select device_id, chat_id, weak, streak, unseen, new_per_day,
      (select count(*)::int from unnest(due_times) t where t <= extract(epoch from now())) as due,
      to_char(local_ts, 'YYYY-MM-DD') as local_day,
      case when last_study_day is null then null else (local_ts::date - last_study_day) end as idle
    from u
    where extract(hour from local_ts)::int = remind_hour
      and (last_sent_day is null or last_sent_day < local_ts::date)
      and (last_study_day is null or last_study_day < local_ts::date)`;
  let sent = 0;
  for (const u of rows) {
    const total = u.due + Math.min(u.new_per_day, u.unseen);
    if (!total) continue;
    const idle: number | null = u.idle;
    // давно не заходит — пишем раз в неделю, чтобы не надоедать
    if (idle !== null && idle > 7 && idle % 7 !== 0) continue;
    const lines = [
      "🔔 Пора повторить математику",
      total > 5
        ? `Сегодня ждёт ${total} ${cards(total)}. Начните с быстрого раунда: 5 карточек, около 3 минут.`
        : `Сегодня ждёт ${total} ${cards(total)}: это около ${minutes(total)} мин.`,
    ];
    if (u.weak) lines.push(`🎯 Слабая тема: ${u.weak}`);
    if (idle === 1 && u.streak >= 2) lines.push(`🔥 Серия ${u.streak} ${days(u.streak)} — не потеряйте её!`);
    else if (idle !== null && idle >= 3) lines.push(`Вы не заходили ${idle} ${days(idle)}: материал как раз начинает забываться. Хватит и 3 минут.`);
    const r = await tg("sendMessage", { chat_id: u.chat_id, text: lines.join("\n"), reply_markup: playButton(site) });
    if (r.ok) {
      sent++;
      await sql`update mathrepeat.users set last_sent_day = ${u.local_day}::date where device_id = ${u.device_id}::text`;
    } else if (r.error_code === 403) { // бота заблокировали
      await sql`update mathrepeat.users set enabled = false where device_id = ${u.device_id}::text`;
    }
  }
  return json({ sent, checked: rows.length });
}

// ---------- один раз после добавления токена ----------
async function setup() {
  const c = await cfg(true);
  const me = await tg("getMe", {});
  if (!me.ok) return json({ ok: false, step: "getMe", error: me.description }, 400);
  await sql`insert into mathrepeat.config (key, value) values ('bot_username', ${me.result.username}::text)
            on conflict (key) do update set value = excluded.value`;
  const hook = `https://${Deno.env.get("SUPABASE_URL")!.replace(/^https?:\/\//, "")}/functions/v1/mathrepeat/bot`;
  const wh = await tg("setWebhook", { url: hook, secret_token: c.webhook_secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  await tg("setMyCommands", { commands: [
    { command: "status", description: "Сколько карточек ждёт" },
    { command: "time", description: "Время напоминания" },
    { command: "stop", description: "Выключить напоминания" },
    { command: "on", description: "Включить напоминания" },
  ] });
  cfgAt = 0;
  return json({ ok: !!wh.ok, bot: me.result.username, webhook: hook, error: wh.ok ? undefined : wh.description });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const route = new URL(req.url).pathname.replace(/\/+$/, "").split("/").pop();
  try {
    if (req.method === "GET" && route === "info") {
      const c = await cfg();
      return json({ bot: c.bot_username || null });
    }
    if (req.method !== "POST") return json({ error: "not found" }, 404);
    if (route === "sync") return await sync(await req.json());
    if (route === "bot") {
      const c = await cfg();
      if (!c.webhook_secret || req.headers.get("x-telegram-bot-api-secret-token") !== c.webhook_secret) return json({ error: "forbidden" }, 403);
      try { await onUpdate(await req.json()); } catch (e) { console.error("update failed", e); }
      return json({ ok: true }); // Telegram не должен повторять доставку
    }
    if (route === "cron" || route === "setup") {
      const c = await cfg(true);
      if (!c.cron_secret || req.headers.get("x-cron-secret") !== c.cron_secret) return json({ error: "forbidden" }, 403);
      return route === "cron" ? await cron() : await setup();
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "server error" }, 500);
  }
});
