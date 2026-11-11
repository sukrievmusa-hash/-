-- Мат-повтор: напоминания в Telegram, синхронизация прогресса и рейтинг группы.
-- Всё лежит в схеме mathrepeat. Нужны расширения pg_cron и pg_net.

create schema if not exists mathrepeat;
revoke all on schema mathrepeat from anon, authenticated;

-- один человек = один чат в Telegram
create table if not exists mathrepeat.people (
  chat_id        bigint primary key,
  tg_name        text,
  nick           text,                        -- имя в рейтинге
  show_top       boolean not null default true,
  remind_hour    smallint not null default 19 check (remind_hour between 0 and 23), -- местный час напоминания
  tz_offset_min  int not null default 300,    -- смещение от UTC в минутах (Казахстан = 300)
  enabled        boolean not null default true,
  due_times      int[] not null default '{}', -- когда «созревает» каждая изученная карточка (unix-секунды)
  unseen         int not null default 0,
  new_per_day    int not null default 15,
  weak           text,                        -- название самой слабой лекции
  streak         int not null default 0,
  last_study_day date,
  last_sent_day  date,
  xp             int not null default 0,
  xp_days        jsonb not null default '{}', -- очки по дням за последние дни: {"2026-11-11": 120}
  state          jsonb,                       -- прогресс по карточкам для переноса между устройствами
  state_rev      bigint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- устройства (браузеры), привязанные к человеку; device_id — случайный секретный id
create table if not exists mathrepeat.devices (
  device_id  text primary key check (char_length(device_id) = 36),
  chat_id    bigint not null references mathrepeat.people (chat_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists devices_chat_idx on mathrepeat.devices (chat_id);

-- настройки и секреты (токен бота кладётся сюда, в репозитории его нет)
create table if not exists mathrepeat.config (
  key   text primary key,
  value text not null
);

alter table mathrepeat.people enable row level security;
alter table mathrepeat.devices enable row level security;
alter table mathrepeat.config enable row level security;
revoke all on all tables in schema mathrepeat from anon, authenticated;

-- очки за последние 7 дней
create or replace function mathrepeat.week_xp(days jsonb, today date) returns int
language sql immutable set search_path = '' as $$
  select coalesce(sum(least(greatest((value)::int, 0), 100000)), 0)::int
  from jsonb_each_text(coalesce(days, '{}'::jsonb))
  where key ~ '^\d{4}-\d{2}-\d{2}$' and key::date between today - 6 and today
$$;

insert into mathrepeat.config (key, value) values
  ('cron_secret',    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  ('webhook_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  ('site_url',       'https://sukrievmusa-hash.github.io/-/')
on conflict (key) do nothing;

-- После деплоя функции (подставьте адрес своего проекта вместо PROJECT_REF):
--
-- 1) токен бота от @BotFather:
--    insert into mathrepeat.config values ('bot_token', '123456:ABC...')
--      on conflict (key) do update set value = excluded.value;
--
-- 2) регистрация вебхука, имени и команд бота (один раз):
--    select net.http_post(
--      url := 'https://PROJECT_REF.supabase.co/functions/v1/mathrepeat/setup',
--      headers := jsonb_build_object('Content-Type', 'application/json',
--                 'x-cron-secret', (select value from mathrepeat.config where key = 'cron_secret')),
--      body := '{}'::jsonb);
--
-- 3) рассылка напоминаний каждый час:
--    select cron.schedule('mathrepeat-remind', '0 * * * *', $$
--      select net.http_post(
--        url := 'https://PROJECT_REF.supabase.co/functions/v1/mathrepeat/cron',
--        headers := jsonb_build_object('Content-Type', 'application/json',
--                   'x-cron-secret', (select value from mathrepeat.config where key = 'cron_secret')),
--        body := '{}'::jsonb)
--    $$);
