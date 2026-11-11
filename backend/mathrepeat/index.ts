// Мат-повтор: сервер напоминаний в Telegram, синхронизации прогресса и рейтинга (Supabase Edge Function).
// Маршруты:
//   GET  /info   — имя бота для сайта
//   POST /sync   — сайт присылает расписание и прогресс; в ответ может прийти прогресс с другого устройства
//   POST /top    — рейтинг группы за 7 дней
//   POST /join   — студент входит в класс по коду (или выходит)
//   POST /teacher — кабинет преподавателя: классы и задания (по секретному коду)
//   POST /bot    — вебхук Telegram (команды /start, /time, /status, /top, /stop, /on)
//   POST /cron   — раз в час: разослать напоминания тем, у кого наступило их время
//   POST /setup  — один раз после добавления токена: вебхук, имя и список команд
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
const TODAY = `((now() at time zone 'utc') + make_interval(mins => tz_offset_min))::date`;
const cleanNick = (v: unknown) => typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 20) : "";

async function sync(b: Record<string, unknown>) {
  const id = String(b.id ?? "");
  if (!UUID.test(id)) return json({ error: "bad id" }, 400);
  if (b.unlink) {
    const d = await sql`delete from mathrepeat.devices where device_id = ${id}::text returning chat_id`;
    // последнее устройство отключилось — удаляем и данные человека
    if (d.length) await sql`delete from mathrepeat.people p where p.chat_id = ${d[0].chat_id}::bigint and not exists (select 1 from mathrepeat.devices x where x.chat_id = p.chat_id)`;
    return json({ linked: false });
  }
  const who = await sql`select p.chat_id, p.state_rev, (p.state is not null) as has_state from mathrepeat.devices d join mathrepeat.people p using (chat_id) where d.device_id = ${id}::text`;
  if (!who.length) return json({ linked: false }); // строку создаёт только бот по команде /start
  const chat = who[0].chat_id, rev = Number(who[0].state_rev);

  const now = Math.floor(Date.now() / 1000);
  const due = (Array.isArray(b.due) ? b.due : []).slice(0, 5000)
    .map((x) => Math.floor(Number(x))).filter((x) => Number.isFinite(x) && x > 0 && x < now + 20 * 365 * 86400);
  const int = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const lastDay = typeof b.lastDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.lastDay) ? b.lastDay : null;
  const weak = typeof b.weak === "string" && b.weak ? b.weak.slice(0, 120) : null;
  const xpDays: Record<string, number> = {};
  if (b.xpDays && typeof b.xpDays === "object") {
    Object.entries(b.xpDays as Record<string, unknown>).slice(0, 14).forEach(([k, v]) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) xpDays[k] = int(v, 0, 100000, 0);
    });
  }
  const nick = cleanNick(b.nick);
  const show = typeof b.show === "boolean" ? b.show : null;
  const rows = await sql`
    update mathrepeat.people set
      due_times = string_to_array(${due.join(",")}::text, ',')::int[],
      tz_offset_min = ${int(b.tz, -720, 840, 300)}::int,
      unseen = ${int(b.unseen, 0, 100000, 0)}::int,
      new_per_day = ${int(b.newPerDay, 0, 200, 15)}::int,
      weak = ${weak}::text,
      streak = ${int(b.streak, 0, 100000, 0)}::int,
      last_study_day = ${lastDay}::date,
      xp = coalesce(${b.xp == null ? null : int(b.xp, 0, 100000000, 0)}::int, xp),
      xp_days = coalesce(${b.xpDays && typeof b.xpDays === "object" ? JSON.stringify(xpDays) : null}::text::jsonb, xp_days),
      nick = coalesce(nullif(${nick}::text, ''), nick),
      show_top = coalesce(${show}::boolean, show_top),
      updated_at = now()
    where chat_id = ${chat}::bigint
    returning remind_hour, nick, show_top, class_id`;
  const out: Record<string, unknown> = { linked: true, hour: rows[0].remind_hour, nick: rows[0].nick, show: rows[0].show_top, rev };
  if (rows[0].class_id) {
    const k = await sql`select name from mathrepeat.classes where id = ${rows[0].class_id}::int`;
    const t = await sql`select id, lecture, title, note, teacher, to_char(due, 'YYYY-MM-DD') as due, to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day
      from mathrepeat.assignments where class_id = ${rows[0].class_id}::int and created_at > now() - interval '30 days' order by created_at desc limit 10`;
    out.cls = k[0]?.name ?? null; out.tasks = t;
  }

  // прогресс: если на сервере версия новее той, что видело устройство, — отдаём её, устройство сольёт и пришлёт заново
  const base = int(b.base, 0, Number.MAX_SAFE_INTEGER, 0);
  if (who[0].has_state && base !== rev) {
    const st = await sql`select state::text as state from mathrepeat.people where chat_id = ${chat}::bigint`;
    out.state = JSON.parse(st[0].state);
  } else if (b.state && typeof b.state === "object") {
    const text = JSON.stringify(b.state);
    if (text.length <= 400_000) {
      const r = await sql`update mathrepeat.people set state = ${text}::text::jsonb, state_rev = state_rev + 1 where chat_id = ${chat}::bigint and state_rev = ${rev}::bigint returning state_rev`;
      if (r.length) out.rev = Number(r[0].state_rev);
    }
  }
  return json(out);
}

// ---------- классы и преподаватель ----------
async function join(b: Record<string, unknown>) {
  const id = String(b.id ?? "");
  if (!UUID.test(id)) return json({ error: "bad id" }, 400);
  const who = await sql`select chat_id from mathrepeat.devices where device_id = ${id}::text`;
  if (!who.length) return json({ linked: false });
  if (b.leave) {
    await sql`update mathrepeat.people set class_id = null where chat_id = ${who[0].chat_id}::bigint`;
    return json({ linked: true, cls: null });
  }
  const code = String(b.code ?? "").trim().toUpperCase().slice(0, 20);
  const k = code ? await sql`select id, name from mathrepeat.classes where code = ${code}::text` : [];
  if (!k.length) return json({ linked: true, error: "no class" }, 404);
  await sql`update mathrepeat.people set class_id = ${k[0].id}::int where chat_id = ${who[0].chat_id}::bigint`;
  return json({ linked: true, cls: k[0].name });
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
const cleanText = (v: unknown, n: number) => typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n) : "";

async function teacher(b: Record<string, unknown>) {
  const c = await cfg(true);
  const given = String(b.code ?? "");
  if (!c.teacher_code || given.length !== c.teacher_code.length || given !== c.teacher_code) return json({ error: "forbidden" }, 403);
  const action = String(b.action ?? "list");
  if (action === "class_create") {
    const name = cleanText(b.name, 60);
    if (!name) return json({ error: "name" }, 400);
    const r = await sql`insert into mathrepeat.classes (name, code) values (${name}::text, ${newCode()}::text) on conflict (name) do nothing returning id`;
    if (!r.length) return json({ error: "exists" }, 409);
  } else if (action === "class_delete") {
    await sql`delete from mathrepeat.classes where id = ${Math.floor(Number(b.class_id)) || 0}::int`;
  } else if (action === "unassign") {
    await sql`delete from mathrepeat.assignments where id = ${Math.floor(Number(b.id)) || 0}::int`;
  } else if (action === "assign") {
    const classId = Math.floor(Number(b.class_id)) || 0;
    const lecture = cleanText(b.lecture, 40), title = cleanText(b.title, 120), note = cleanText(b.note, 300), who = cleanText(b.teacher, 40);
    const due = typeof b.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.due) ? b.due : null;
    const k = await sql`select name from mathrepeat.classes where id = ${classId}::int`;
    if (!k.length || !lecture || !title) return json({ error: "bad request" }, 400);
    await sql`insert into mathrepeat.assignments (class_id, lecture, title, note, due, teacher) values (${classId}::int, ${lecture}::text, ${title}::text, ${note || null}::text, ${due}::date, ${who || null}::text)`;
    const members = await sql`select chat_id from mathrepeat.people where class_id = ${classId}::int and enabled`;
    const site = c.site_url || "";
    const text = [`Новое задание${who ? " от " + who : " от преподавателя"}: ${title}`, due ? `Повторить до ${due.split("-").reverse().join(".")}.` : "Повторите эту тему.", note || "", "Хватит нескольких минут."].filter(Boolean).join("\n");
    let sent = 0;
    for (const m of members) {
      const r = await tg("sendMessage", { chat_id: m.chat_id, text, reply_markup: { inline_keyboard: [[{ text: "Повторить тему", url: `${site}#task=${encodeURIComponent(lecture)}` }]] } });
      if (r.ok) sent++;
      else if (r.error_code === 403) await sql`update mathrepeat.people set enabled = false where chat_id = ${m.chat_id}::bigint`;
    }
    return json({ ok: true, sent, members: members.length, ...(await teacherList()) });
  }
  return json({ ok: true, ...(await teacherList()) });
}
async function teacherList() {
  const classes = await sql`select k.id, k.name, k.code, (select count(*)::int from mathrepeat.people p where p.class_id = k.id) as members from mathrepeat.classes k order by k.name`;
  const tasks = await sql`select id, class_id, lecture, title, note, teacher, to_char(due, 'YYYY-MM-DD') as due, to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day
    from mathrepeat.assignments order by created_at desc limit 30`;
  return { classes, tasks };
}

// ---------- рейтинг ----------
async function topRows(limit: number) {
  return await sql`
    select chat_id, coalesce(nullif(nick, ''), split_part(coalesce(tg_name, ''), ' ', 1), 'Без имени') as nick, streak,
      case when last_study_day >= ${sql.unsafe(TODAY)} - 1 then streak else 0 end as live_streak,
      mathrepeat.week_xp(xp_days, ${sql.unsafe(TODAY)}) as week
    from mathrepeat.people where show_top
    order by week desc, xp desc limit ${limit}::int`;
}
async function top(b: Record<string, unknown>) {
  const id = String(b.id ?? "");
  if (!UUID.test(id)) return json({ error: "bad id" }, 400);
  const who = await sql`select chat_id from mathrepeat.devices where device_id = ${id}::text`;
  if (!who.length) return json({ linked: false });
  const rows = (await topRows(50)).filter((r) => r.week > 0 || String(r.chat_id) === String(who[0].chat_id));
  return json({ linked: true, top: rows.map((r, i) => ({ place: i + 1, nick: r.nick, week: r.week, streak: r.live_streak, me: String(r.chat_id) === String(who[0].chat_id) })) });
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
      const r = await sql`update mathrepeat.people set remind_hour = ${h}::int, enabled = true where chat_id = ${chat}::bigint returning chat_id`;
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
    from mathrepeat.people where chat_id = ${chat}::bigint limit 1`;
  const notLinked = () => tg("sendMessage", {
    chat_id: chat,
    text: "Чтобы я напоминал о повторении, откройте сайт → «Настройки» → «Подключить Telegram».",
    reply_markup: { inline_keyboard: [[{ text: "Открыть сайт", url: site }]] },
  });

  if (command === "/start") {
    if (arg && UUID.test(arg)) {
      const r = await sql`
        insert into mathrepeat.people (chat_id, tg_name) values (${chat}::bigint, ${name}::text)
        on conflict (chat_id) do update set tg_name = excluded.tg_name, enabled = true
        returning remind_hour, (state is not null) as has_state`;
      await sql`
        insert into mathrepeat.devices (device_id, chat_id) values (${arg}::text, ${chat}::bigint)
        on conflict (device_id) do update set chat_id = excluded.chat_id`;
      // не больше 5 устройств на человека: самые старые отвязываем
      await sql`delete from mathrepeat.devices where chat_id = ${chat}::bigint and device_id not in (select device_id from mathrepeat.devices where chat_id = ${chat}::bigint order by created_at desc limit 5)`;
      await tg("sendMessage", {
        chat_id: chat,
        text: `✅ Подключено!\n\nКаждый день в ${hh(r[0].remind_hour)} напишу, сколько карточек пора повторить и какая тема проседает. Если уже позанимались или повторять нечего, не побеспокою.\n\n` +
          (r[0].has_state ? "Ваш прогресс с другого устройства появится на сайте, как только вы на него вернётесь.\n\n" : "Прогресс теперь сохраняется: подключите этот же Telegram на другом устройстве, и он перенесётся.\n\n") +
          "Вы участвуете в рейтинге группы под своим именем из Telegram. Изменить имя или скрыться можно на сайте во вкладке «Рейтинг».\n\nВыберите удобное время:",
        reply_markup: hourKeyboard(),
      });
      await tg("sendMessage", { chat_id: chat, text: "Теперь вернитесь на сайт: он передаст мне расписание ваших карточек.", reply_markup: { inline_keyboard: [[{ text: "Вернуться на сайт", url: site }]] } });
    } else {
      const r = await mine();
      if (r.length) await tg("sendMessage", { chat_id: chat, text: `Вы уже подключены, напоминаю в ${hh(r[0].remind_hour)}.\n/time — изменить время\n/status — что на сегодня\n/top — рейтинг группы\n/stop — выключить напоминания` });
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
    await sql`update mathrepeat.people set enabled = false where chat_id = ${chat}::bigint`;
    await tg("sendMessage", { chat_id: chat, text: "Напоминания выключены. Включить снова: /on" });
  } else if (command === "/on") {
    await sql`update mathrepeat.people set enabled = true where chat_id = ${chat}::bigint`;
    await tg("sendMessage", { chat_id: chat, text: `Напоминания включены, пишу в ${hh(me.remind_hour)}.` });
  } else if (command === "/status") {
    const total = me.due + Math.min(me.new_per_day, me.unseen);
    // общее число не показываем: большая цифра отбивает желание начинать
    const text = total
      ? (total > 5 ? "Начните с малого: 5 карточек, около 3 минут. Остальное подождёт." : `Сегодня ${total} ${cards(total)}: это около ${minutes(total)} мин.`) + (me.weak ? `\nСлабая тема: ${me.weak}` : "")
      : "Сейчас повторять нечего.";
    await tg("sendMessage", { chat_id: chat, text, reply_markup: playButton(site) });
  } else if (command === "/top") {
    const rows = (await topRows(10)).filter((x) => x.week > 0);
    const medal = ["🥇", "🥈", "🥉"];
    const text = rows.length
      ? "🏆 Рейтинг группы за 7 дней\n\n" + rows.map((x, i) => `${medal[i] || (i + 1) + "."} ${x.nick} — ${x.week} XP` + (String(x.chat_id) === String(chat) ? "  ← вы" : "")).join("\n")
      : "За последние 7 дней пока никто не занимался. Станьте первым!";
    await tg("sendMessage", { chat_id: chat, text, reply_markup: playButton(site) });
  } else {
    await tg("sendMessage", { chat_id: chat, text: "Команды:\n/status — что на сегодня\n/top — рейтинг группы\n/time — время напоминания\n/stop — выключить\n/on — включить" });
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
      from mathrepeat.people where enabled
    ), ranked as (
      select chat_id, rank() over (order by mathrepeat.week_xp(xp_days, ${sql.unsafe(TODAY)}) desc) as place,
        mathrepeat.week_xp(xp_days, ${sql.unsafe(TODAY)}) as week, count(*) over () as total
      from mathrepeat.people where show_top
    )
    select u.chat_id, weak, streak, unseen, new_per_day, r.place::int as place, r.week, r.total::int as total,
      (select count(*)::int from unnest(due_times) t where t <= extract(epoch from now())) as due,
      to_char(local_ts, 'YYYY-MM-DD') as local_day,
      case when last_study_day is null then null else (local_ts::date - last_study_day) end as idle
    from u left join ranked r using (chat_id)
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
      "Пора повторить математику",
      total > 5
        ? "Начните с быстрого раунда: 5 карточек, около 3 минут. Остальное подождёт."
        : `Сегодня ${total} ${cards(total)}: это около ${minutes(total)} мин.`,
    ];
    if (u.weak) lines.push(`Слабая тема: ${u.weak}`);
    if (idle === 1 && u.streak >= 2) lines.push(`Серия ${u.streak} ${days(u.streak)}: одна короткая сессия её сохранит.`);
    else if (idle !== null && idle >= 3) lines.push("С возвращением. Ничего не потеряно: хватит и 3 минут.");
    if (u.total > 1 && u.place) lines.push(u.week > 0 ? `В рейтинге группы вы на ${u.place} месте из ${u.total}` : `В рейтинге группы уже ${u.total} чел. — на этой неделе у вас пока 0 XP`);
    const r = await tg("sendMessage", { chat_id: u.chat_id, text: lines.join("\n"), reply_markup: playButton(site) });
    if (r.ok) {
      sent++;
      await sql`update mathrepeat.people set last_sent_day = ${u.local_day}::date where chat_id = ${u.chat_id}::bigint`;
    } else if (r.error_code === 403) { // бота заблокировали
      await sql`update mathrepeat.people set enabled = false where chat_id = ${u.chat_id}::bigint`;
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
    { command: "status", description: "Что на сегодня" },
    { command: "top", description: "Рейтинг группы" },
    { command: "time", description: "Время напоминания" },
    { command: "stop", description: "Выключить напоминания" },
    { command: "on", description: "Включить напоминания" },
  ] });
  await tg("setMyName", { name: "Мат-повтор: математика без забывания" });
  await tg("setMyShortDescription", { short_description: "Напоминаю повторять лекции по математике: 3 минуты в день, чтобы не забывать." });
  await tg("setMyDescription", { description: "Напоминаю, когда пора повторить лекции по математике, показываю слабую тему и рейтинг группы. Подключается с сайта: «Подключить Telegram»." });
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
    if (route === "top") return await top(await req.json());
    if (route === "join") return await join(await req.json());
    if (route === "teacher") return await teacher(await req.json());
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
