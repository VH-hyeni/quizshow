-- =====================================================================
--  퀴즈쇼 / 투표 — Supabase 설정 스크립트
--  Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 Run 하세요.
--  여러 번 실행해도 안전합니다(기존 참가자/투표 데이터는 유지).
--
--  ★ 실행 후 맨 아래 "진행자 PIN 설정" 줄의 PIN을 꼭 바꿔서 한 번 더 실행하세요.
-- =====================================================================

-- ---------- 테이블 ----------------------------------------------------

-- 현재 게임 상태 (행 1개). 모든 참가자 화면이 이 행의 변경을 실시간 구독합니다.
create table if not exists public.game (
  id          int primary key default 1 check (id = 1),
  phase       text not null default 'lobby'
              check (phase in ('lobby','question','closed','reveal','leaderboard','end')),
  q_index     int  not null default -1,
  q_total     int  not null default 0,
  question    jsonb,            -- 현재 문항 (정답 제외): {text, options[], kind, time_limit}
  correct     int,              -- 정답 번호. 'reveal' 이후에만 채워짐
  started_at  timestamptz,
  updated_at  timestamptz not null default now()
);
insert into public.game (id) values (1) on conflict do nothing;
alter table public.game add column if not exists chat_on boolean not null default true;   -- 채팅 허용 여부
alter table public.game add column if not exists chat_epoch int not null default 0;       -- 진행자가 채팅을 지울 때마다 +1 (스크린 채팅창 비우기 신호)

-- 진행자 PIN 과 전체 문항(정답 포함). 참가자는 절대 읽을 수 없습니다.
create table if not exists public.host_secret (
  id         int primary key default 1 check (id = 1),
  pin        text not null,
  questions  jsonb not null default '[]'::jsonb
);

create table if not exists public.players (
  id          uuid primary key,
  nickname    text not null check (char_length(nickname) between 1 and 20),
  avatar      jsonb not null default '{}'::jsonb,     -- 내 아바타: {h, hc, s, e, f, o, oc, a}
  created_at  timestamptz not null default now()
);
alter table public.players add column if not exists avatar jsonb not null default '{}'::jsonb;
alter table public.players add column if not exists vip boolean not null default false;   -- 진행자가 지정한 '크게 보일 사람'

create table if not exists public.votes (
  player_id   uuid not null references public.players(id) on delete cascade,
  q_index     int  not null,
  choice      int  not null,
  elapsed_ms  int  not null,
  created_at  timestamptz not null default now(),
  primary key (player_id, q_index)          -- 1인 1문항 1표
);
create index if not exists votes_q_idx on public.votes (q_index, choice);

-- 정답 공개된 문항 기록 (점수 계산용)
create table if not exists public.results (
  q_index     int primary key,
  kind        text not null,
  correct     int,
  time_limit  int not null default 0
);

alter table public.results add column if not exists game text;   -- 미니게임 종류 (order | reaction | tap)

-- 미니게임 기록: 1인 1게임 1기록
--   order(숫자 순서)·reaction(반응속도) = 걸린 ms (작을수록 잘함), tap(광클) = 누른 횟수 (클수록 잘함)
create table if not exists public.plays (
  player_id   uuid not null references public.players(id) on delete cascade,
  q_index     int  not null,
  value       numeric not null,
  created_at  timestamptz not null default now(),
  primary key (player_id, q_index)
);

-- 말풍선 채팅 · 리액션 (스크린에 잠깐 띄우고 버리는 데이터)
create table if not exists public.feed (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.players(id) on delete cascade,
  kind        smallint not null,            -- 0 = 채팅, 1 = 댄스(d1·d2·d3)
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists feed_player_idx on public.feed (player_id, created_at);
create index if not exists feed_time_idx on public.feed (created_at);

-- ---------- 보안 (RLS) -------------------------------------------------
-- 참가자(anon 키)는 game 행 읽기만 가능. 나머지는 아래 함수(RPC)로만 접근.
alter table public.game        enable row level security;
alter table public.host_secret enable row level security;
alter table public.players     enable row level security;
alter table public.votes       enable row level security;
alter table public.results     enable row level security;
alter table public.plays       enable row level security;
alter table public.feed        enable row level security;

drop policy if exists "game is public" on public.game;
create policy "game is public" on public.game for select to anon, authenticated using (true);

revoke all on public.game, public.host_secret, public.players, public.votes, public.results, public.plays, public.feed
  from anon, authenticated;
grant select on public.game to anon, authenticated;

-- 실시간 구독 대상에 game 테이블 추가
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game') then
    alter publication supabase_realtime add table public.game;
  end if;
end $$;

-- ---------- 점수 계산 -------------------------------------------------
-- 퀴즈(객관식·OX) 정답: 500점 + 빠르기 보너스 최대 500점 (제한시간 대비 남은 비율)
-- 미니게임: 순위대로 1000점(1등) ~ 100점(꼴찌)
drop view if exists public.scores;
create view public.scores as
with quiz as (
  select v.player_id,
         sum(500 + case when r.time_limit > 0
                        then greatest(0, round(500 * (1 - v.elapsed_ms::numeric / (r.time_limit * 1000))))::int
                        else 0 end) as pts,
         count(*) as correct_cnt
  from public.votes v
  join public.results r on r.q_index = v.q_index and r.kind = 'quiz' and v.choice = r.correct
  group by v.player_id
), ranked as (
  select pl.player_id,
         rank()   over (partition by pl.q_index order by case when r.game = 'tap' then -pl.value else pl.value end) as rnk,
         count(*) over (partition by pl.q_index) as cnt
  from public.plays pl
  join public.results r on r.q_index = pl.q_index and r.kind = 'game'
), game as (
  select player_id,
         sum(case when cnt = 1 then 1000 else round(1000 - 900.0 * (rnk - 1) / (cnt - 1)) end) as pts
  from ranked group by player_id
)
select p.id, p.nickname,
       (coalesce(q.pts, 0) + coalesce(gm.pts, 0))::int as score,
       coalesce(q.correct_cnt, 0)::int as correct_cnt
from public.players p
left join quiz q  on q.player_id = p.id
left join game gm on gm.player_id = p.id;

revoke all on public.scores from anon, authenticated;

-- ---------- 참가자용 함수 ---------------------------------------------

create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now() $$;

-- 캐릭터 값 정리 (범위를 벗어나거나 이상한 값은 0으로)
create or replace function public._avatar(p jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, case when jsonb_typeof(p -> k) = 'number'
                                            and (p ->> k)::numeric = floor((p ->> k)::numeric)
                                            and (p ->> k)::numeric between 0 and mx
                                       then (p ->> k)::numeric::int else 0 end), '{}'::jsonb)
  from (values ('h', 7), ('hc', 7), ('s', 3), ('e', 4), ('f', 3), ('o', 6), ('oc', 7), ('a', 6)) as t(k, mx)
$$;

drop function if exists public.join_game(uuid, text);
create or replace function public.join_game(p_id uuid, p_nickname text, p_avatar jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  p_nickname := btrim(coalesce(p_nickname, ''));
  if char_length(p_nickname) = 0 or char_length(p_nickname) > 20 then
    raise exception '닉네임은 1~20자로 입력해 주세요.';
  end if;
  if not exists (select 1 from players where id = p_id)
     and (select count(*) from players) >= 500 then
    raise exception '참가 인원이 가득 찼습니다.';
  end if;
  insert into players (id, nickname, avatar) values (p_id, p_nickname, _avatar(coalesce(p_avatar, '{}'::jsonb)))
  on conflict (id) do update set nickname = excluded.nickname, avatar = excluded.avatar;
end $$;

-- 반환값: ok | already | closed | timeout | invalid | unknown_player
create or replace function public.submit_vote(p_id uuid, p_choice int)
returns text language plpgsql security definer set search_path = public as $$
declare
  g      game;
  lim    int;
  el     int;
begin
  select * into g from game where id = 1;
  if g.phase <> 'question' then return 'closed'; end if;
  if not exists (select 1 from players where id = p_id) then return 'unknown_player'; end if;
  if p_choice is null or p_choice < 0
     or p_choice >= jsonb_array_length(g.question -> 'options') then
    return 'invalid';
  end if;
  el  := floor(extract(epoch from (clock_timestamp() - g.started_at)) * 1000);
  lim := coalesce((g.question ->> 'time_limit')::int, 0);
  if lim > 0 and el > lim * 1000 + 1500 then return 'timeout'; end if;   -- 1.5초 네트워크 여유

  insert into votes (player_id, q_index, choice, elapsed_ms)
  values (p_id, g.q_index, p_choice, least(el, 2147483647))
  on conflict do nothing;
  if found then return 'ok'; else return 'already'; end if;
end $$;

-- 내 상태: 점수, 순위, 현재 문항에서 고른 번호
create or replace function public.my_status(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with ranked as (
    select id, nickname, score, correct_cnt, rank() over (order by score desc) as rnk
    from scores
  )
  select jsonb_build_object(
           'nickname', r.nickname,
           'avatar',   (select avatar from players where id = p_id),
           'score',    r.score,
           'correct',  r.correct_cnt,
           'rank',     r.rnk,
           'players',  (select count(*) from players),
           'choice',   (select v.choice from votes v join game g on g.id = 1
                        where v.player_id = p_id and v.q_index = g.q_index),
           'play',     (select pl.value from plays pl join game g on g.id = 1
                        where pl.player_id = p_id and pl.q_index = g.q_index),
           'play_rank',(select case when me.value is null then null else 1 + (
                          select count(*) from plays o where o.q_index = g.q_index
                            and (case when g.question ->> 'game' = 'tap' then o.value > me.value else o.value < me.value end)) end
                        from game g left join plays me on me.player_id = p_id and me.q_index = g.q_index
                        where g.id = 1))
  from ranked r where r.id = p_id
$$;

-- 미니게임 기록 제출. 반환값: ok | already | closed | timeout | invalid | unknown_player
create or replace function public.submit_game(p_id uuid, p_value numeric)
returns text language plpgsql security definer set search_path = public as $$
declare
  g    game;
  el   int;
  lim  int;
  kind text;
begin
  select * into g from game where id = 1;
  if g.phase <> 'question' or coalesce(g.question ->> 'kind', '') <> 'game' then return 'closed'; end if;
  if not exists (select 1 from players where id = p_id) then return 'unknown_player'; end if;
  el   := floor(extract(epoch from (clock_timestamp() - g.started_at)) * 1000);
  lim  := coalesce((g.question ->> 'time_limit')::int, 60);
  if el > lim * 1000 + 3000 then return 'timeout'; end if;
  kind := g.question ->> 'game';
  if p_value is null
     or (kind in ('order', 'reaction') and (p_value < 50 or p_value > lim * 1000 + 3000))
     or (kind = 'tap' and (p_value < 0 or p_value > 25 * coalesce((g.question ->> 'duration')::int, 10))) then
    return 'invalid';
  end if;
  insert into plays (player_id, q_index, value) values (p_id, g.q_index, p_value)
  on conflict do nothing;
  if found then return 'ok'; else return 'already'; end if;
end $$;

-- 미니게임 순위판 (게임 중에도 실시간으로 공개)
create or replace function public.get_game_board(p_limit int default 10)
returns jsonb language sql stable security definer set search_path = public as $$
  with g as (select * from game where id = 1),
  b as (
    select p.nickname, p.avatar, pl.value,
           rank() over (order by case when (select question ->> 'game' from g) = 'tap' then -pl.value else pl.value end) as rnk
    from plays pl join players p on p.id = pl.player_id
    where pl.q_index = (select q_index from g)
  )
  select jsonb_build_object(
    'done',    (select count(*) from b),
    'players', (select count(*) from players),
    'top',     coalesce((select jsonb_agg(jsonb_build_object('rank', rnk, 'n', nickname, 'a', avatar, 'v', value) order by rnk, nickname)
                         from (select * from b order by rnk, nickname limit least(greatest(p_limit, 1), 50)) t), '[]'::jsonb))
$$;

-- 집계. 퀴즈 진행 중에는 선택지별 숫자를 숨김(응답 수만 공개). 투표 문항·정답 공개 후·진행자는 전체 공개.
create or replace function public.get_tally(p_pin text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g        game;
  n_opts   int;
  show     boolean;
  counts   jsonb;
begin
  select * into g from game where id = 1;
  n_opts := coalesce(jsonb_array_length(g.question -> 'options'), 0);
  show := g.phase in ('reveal','leaderboard','end')
          or coalesce(g.question ->> 'show', case when g.question ->> 'kind' = 'poll' then 'live' else 'reveal' end) = 'live'
          or (p_pin is not null and exists (select 1 from host_secret where id = 1 and pin = p_pin));
  if show and n_opts > 0 then
    select jsonb_agg(coalesce(c.cnt, 0) order by i) into counts
    from generate_series(0, n_opts - 1) i
    left join (select choice, count(*) cnt from votes where q_index = g.q_index group by choice) c
      on c.choice = i;
  end if;
  return jsonb_build_object(
    'q_index', g.q_index,
    'counts',  counts,                                     -- 숨김이면 null
    'voted',   case when g.question ->> 'kind' = 'game'
                    then (select count(*) from plays where q_index = g.q_index)
                    else (select count(*) from votes where q_index = g.q_index) end,
    'players', (select count(*) from players));
end $$;

create or replace function public.get_leaderboard(p_limit int default 10)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', rnk, 'nickname', nickname, 'score', score, 'correct', correct_cnt, 'avatar', avatar)
           order by rnk, nickname), '[]'::jsonb)
  from (select s.nickname, s.score, s.correct_cnt, p.avatar, rank() over (order by s.score desc) as rnk
        from scores s join players p on p.id = s.id order by s.score desc, s.nickname
        limit least(greatest(p_limit, 1), 50)) t
$$;

-- 대기실 화면용: 인원 수 + 최근 입장한 캐릭터
create or replace function public.lobby_info()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'players', (select count(*) from players),
    'recent',  coalesce((select jsonb_agg(jsonb_build_object('id', left(id::text, 8), 'n', nickname, 'a', avatar, 'v', vip) order by vip desc, created_at desc)
                         from (select id, nickname, avatar, vip, created_at from players
                               order by vip desc, created_at desc limit 40) t), '[]'::jsonb))
$$;

-- 결과 화면용: 누가 어느 보기에 모였는지 (퀴즈는 정답 공개 후, 투표는 실시간)
create or replace function public.get_crowd()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g    game;
  show boolean;
begin
  select * into g from game where id = 1;
  -- 아직 안 고른 사람은 c = null (구경꾼). 공개 방식에 따라 고른 답을 숨김
  show := case coalesce(g.question ->> 'show', case when g.question ->> 'kind' = 'poll' then 'live' else 'reveal' end)
            when 'live'   then true
            when 'hidden' then false
            else g.phase in ('reveal','leaderboard','end') end;
  return coalesce((select jsonb_agg(jsonb_build_object(
                     'id', left(p.id::text, 8),
                     'c',  case when show and g.q_index >= 0 then v.choice end,
                     'n',  p.nickname, 'a', p.avatar, 'v', p.vip)
                   order by p.vip desc, coalesce(v.elapsed_ms, 2147483647), p.created_at)
                   from players p
                   left join votes v on v.player_id = p.id and v.q_index = g.q_index), '[]'::jsonb);
end $$;

-- 채팅(kind 0) · 댄스(kind 1) 보내기. 반환값: ok | slow | off | invalid | unknown_player
create or replace function public.send_feed(p_id uuid, p_kind int, p_body text)
returns text language plpgsql security definer set search_path = public as $$
declare
  body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
begin
  if not exists (select 1 from players where id = p_id) then return 'unknown_player'; end if;
  if p_kind = 1 then
    if body not in ('d1','d2','d3') then return 'invalid'; end if;
    if exists (select 1 from feed where player_id = p_id and kind = 1 and created_at > now() - interval '2.5 seconds') then return 'slow'; end if;
  elsif p_kind = 0 then
    if not (select chat_on from game where id = 1) then return 'off'; end if;
    if char_length(body) = 0 then return 'invalid'; end if;
    body := left(body, 40);
    -- 기본 욕설 가림
    body := regexp_replace(body, '(씨발|시발|씨빨|ㅅㅂ|ㅆㅂ|병신|ㅂㅅ|좆|존나|개새|새끼|미친놈|fuck|shit|bitch)', '♡♡', 'gi');
    if exists (select 1 from feed where player_id = p_id and kind = 0 and created_at > now() - interval '3 seconds') then return 'slow'; end if;
  else
    return 'invalid';
  end if;
  insert into feed (player_id, kind, body) values (p_id, p_kind, body);
  -- 댄스는 1분 지나면 정리. 채팅은 진행자가 지우기 전까지 남김(최근 300개까지)
  delete from feed where kind = 1 and created_at < now() - interval '1 minute';
  if p_kind = 0 then
    delete from feed where kind = 0 and id < (select min(id) from (select id from feed where kind = 0 order by id desc limit 300) t);
  end if;
  return 'ok';
end $$;

-- 스크린이 새 채팅·댄스를 가져감.
-- p_after = 0 (스크린을 처음 열 때): 지금까지의 채팅 최근 100개를 돌려줌 (새로고침해도 채팅창 유지)
-- p_after > 0: 그 뒤의 새 채팅 + 최근 15초 안의 댄스
create or replace function public.get_feed(p_after bigint default 0)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'epoch', (select chat_epoch from game where id = 1),
    'last',  coalesce((select max(id) from feed), 0),
    'items', coalesce((select jsonb_agg(jsonb_build_object('k', f.id, 'id', left(f.player_id::text, 8), 'n', p.nickname, 'a', p.avatar, 'v', p.vip, 't', f.kind, 'b', f.body) order by f.id)
                       from (select * from (
                               select * from feed
                               where case when coalesce(p_after, 0) = 0 then kind = 0
                                          else id > p_after and (kind = 0 or created_at > now() - interval '15 seconds') end
                               order by id desc limit 150) x
                             order by id limit 150) f
                       join players p on p.id = f.player_id), '[]'::jsonb))
$$;

-- 진행자: 참가자 목록 (크게 보일 사람 지정용)
create or replace function public.host_people(p_pin text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _check_pin(p_pin);
  return coalesce((select jsonb_agg(jsonb_build_object('id', left(id::text, 8), 'n', nickname, 'a', avatar, 'v', vip) order by vip desc, nickname)
                   from players), '[]'::jsonb);
end $$;

create or replace function public.host_set_vip(p_pin text, p_sid text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _check_pin(p_pin);
  update players set vip = p_on where left(id::text, 8) = p_sid;
end $$;

create or replace function public.host_set_chat(p_pin text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _check_pin(p_pin);
  update game set chat_on = p_on, updated_at = now() where id = 1;
end $$;

-- 진행자: 채팅 전부 지우기 (스크린 채팅창도 비워짐)
create or replace function public.host_clear_chat(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _check_pin(p_pin);
  delete from feed where true;
  update game set chat_epoch = chat_epoch + 1, updated_at = now() where id = 1;
end $$;

-- ---------- 진행자용 함수 (PIN 필요) ----------------------------------

create or replace function public._check_pin(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin is null or not exists (select 1 from host_secret where id = 1 and pin = p_pin) then
    raise exception '진행자 PIN이 올바르지 않습니다.';
  end if;
end $$;

create or replace function public.host_check(p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform _check_pin(p_pin);
  return (select jsonb_build_object('questions', questions) from host_secret where id = 1);
end $$;

-- 문항 업로드. 형식: [{ "text": "...", "options": ["..",".."], "answer": 0, "kind": "quiz", "time_limit": 20 }, ...]
create or replace function public.host_load_questions(p_pin text, p_questions jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  q      jsonb;
  i      int := 0;
  kind   text;
  n      int;
begin
  perform _check_pin(p_pin);
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception '문항은 1개 이상인 배열이어야 합니다.';
  end if;
  for q in select * from jsonb_array_elements(p_questions) loop
    i := i + 1;
    kind := coalesce(q ->> 'kind', 'quiz');
    if kind not in ('quiz','poll','game') then
      raise exception '%번 문항: kind는 quiz, poll, game 중 하나여야 합니다.', i; end if;
    if coalesce(btrim(q ->> 'text'), '') = '' then
      raise exception '%번 문항: text가 비어 있습니다.', i; end if;
    if q ? 'show' and coalesce(q ->> 'show', '') not in ('live','reveal','hidden') then
      raise exception '%번 문항: 공개 방식은 실시간, 정답때, 비공개 중 하나입니다.', i; end if;
    if kind = 'game' then
      if coalesce(q ->> 'game', '') not in ('order','reaction','tap') then
        raise exception '%번 문항: 미니게임 종류는 order, reaction, tap 중 하나입니다.', i; end if;
      if q ? 'size' and (jsonb_typeof(q -> 'size') <> 'number' or (q ->> 'size')::int not between 3 and 6) then
        raise exception '%번 문항: 숫자 순서 게임 크기는 3~6입니다.', i; end if;
      if q ? 'duration' and (jsonb_typeof(q -> 'duration') <> 'number' or (q ->> 'duration')::int not between 3 and 60) then
        raise exception '%번 문항: 광클 시간은 3~60초입니다.', i; end if;
      continue;
    end if;
    if jsonb_typeof(q -> 'options') is distinct from 'array' then
      raise exception '%번 문항: options 배열이 필요합니다.', i; end if;
    n := jsonb_array_length(q -> 'options');
    if n < 2 or n > 6 then
      raise exception '%번 문항: 보기는 2~6개여야 합니다.', i; end if;
    if kind = 'quiz' and (jsonb_typeof(q -> 'answer') is distinct from 'number'
                          or (q ->> 'answer')::int < 0 or (q ->> 'answer')::int >= n) then
      raise exception '%번 문항: answer(정답 번호, 0부터 시작)가 올바르지 않습니다.', i; end if;
    if q ? 'time_limit' and (jsonb_typeof(q -> 'time_limit') <> 'number'
                             or (q ->> 'time_limit')::int < 0 or (q ->> 'time_limit')::int > 600) then
      raise exception '%번 문항: time_limit은 0~600초입니다.', i; end if;
  end loop;

  update host_secret set questions = p_questions where id = 1;
  update game set q_total = jsonb_array_length(p_questions), updated_at = now() where id = 1;
  return jsonb_array_length(p_questions);
end $$;

create or replace function public.host_show_question(p_pin text, p_index int)
returns void language plpgsql security definer set search_path = public as $$
declare
  q     jsonb;
  kind  text;
begin
  perform _check_pin(p_pin);
  select questions -> p_index into q from host_secret where id = 1;
  if q is null then raise exception '%번 문항이 없습니다.', p_index + 1; end if;
  kind := coalesce(q ->> 'kind', 'quiz');

  delete from votes   where q_index = p_index;     -- 같은 문항을 다시 시작하면 초기화
  delete from results where q_index = p_index;

  delete from plays where q_index = p_index;

  update game set
    phase      = 'question',
    q_index    = p_index,
    question   = case when kind = 'game' then
                   -- 미니게임: 3초 카운트다운 후 시작. seed 로 모두 같은 배치, delay 로 반응속도 신호 시각 결정
                   jsonb_build_object(
                     'text',     q -> 'text',
                     'options',  '[]'::jsonb,
                     'kind',     'game',
                     'game',     q ->> 'game',
                     'size',     coalesce((q ->> 'size')::int, 4),
                     'duration', coalesce((q ->> 'duration')::int, 10),
                     'seed',     floor(random() * 1000000000)::bigint,
                     'delay_ms', 2000 + floor(random() * 3000)::int,
                     'time_limit', case q ->> 'game'
                                     when 'order'    then coalesce((q ->> 'time_limit')::int, 60)
                                     when 'reaction' then 12
                                     else 3 + coalesce((q ->> 'duration')::int, 10) + 2 end)
                 else jsonb_build_object(
                   'text',       q -> 'text',
                   'options',    q -> 'options',
                   'kind',       kind,
                   'ox',         coalesce((q ->> 'ox')::boolean, false),
                   -- 누가 뭘 골랐는지: live = 고르는 즉시 공개 · reveal = 정답 공개 때 · hidden = 끝까지 비공개(인원수만)
                   'show',       coalesce(q ->> 'show', case when kind = 'poll' then 'live' else 'reveal' end),
                   'time_limit', coalesce((q ->> 'time_limit')::int, case when kind = 'poll' then 0 else 20 end)) end,
    correct    = null,
    started_at = now(),
    updated_at = now()
  where id = 1;
end $$;

create or replace function public.host_close(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _check_pin(p_pin);
  update game set phase = 'closed', updated_at = now() where id = 1 and phase = 'question';
end $$;

create or replace function public.host_reveal(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
declare
  g    game;
  q    jsonb;
  ans  int;
begin
  perform _check_pin(p_pin);
  select * into g from game where id = 1;
  if g.q_index < 0 or g.phase not in ('question','closed','reveal') then
    raise exception '공개할 문항이 없습니다.';
  end if;
  select questions -> g.q_index into q from host_secret where id = 1;
  ans := case when g.question ->> 'kind' = 'quiz' then (q ->> 'answer')::int end;

  insert into results (q_index, kind, correct, time_limit, game)
  values (g.q_index, g.question ->> 'kind', ans, coalesce((g.question ->> 'time_limit')::int, 0), g.question ->> 'game')
  on conflict (q_index) do update
    set kind = excluded.kind, correct = excluded.correct, time_limit = excluded.time_limit, game = excluded.game;

  update game set phase = 'reveal', correct = ans, updated_at = now() where id = 1;
end $$;

create or replace function public.host_set_phase(p_pin text, p_phase text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _check_pin(p_pin);
  if p_phase not in ('lobby','leaderboard','end') then
    raise exception '허용되지 않는 단계: %', p_phase;
  end if;
  update game set phase = p_phase, updated_at = now() where id = 1;
end $$;

-- 초기화. p_keep_players = true 면 참가자는 남기고 점수/투표만 지움
create or replace function public.host_reset(p_pin text, p_keep_players boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _check_pin(p_pin);
  delete from votes where true;
  delete from plays where true;
  delete from feed where true;
  delete from results where true;
  if not p_keep_players then delete from players where true; end if;
  update game set phase = 'lobby', q_index = -1, question = null, correct = null,
                  started_at = null, chat_epoch = chat_epoch + 1, updated_at = now() where id = 1;
end $$;

-- ---------- 함수 실행 권한 --------------------------------------------
revoke execute on function
  public._check_pin(text),
  public._avatar(jsonb),
  public.server_now(),
  public.join_game(uuid, text, jsonb),
  public.get_crowd(),
  public.send_feed(uuid, int, text),
  public.get_feed(bigint),
  public.host_set_chat(text, boolean),
  public.host_clear_chat(text),
  public.host_people(text),
  public.host_set_vip(text, text, boolean),
  public.submit_game(uuid, numeric),
  public.get_game_board(int),
  public.submit_vote(uuid, int),
  public.my_status(uuid),
  public.get_tally(text),
  public.get_leaderboard(int),
  public.lobby_info(),
  public.host_check(text),
  public.host_load_questions(text, jsonb),
  public.host_show_question(text, int),
  public.host_close(text),
  public.host_reveal(text),
  public.host_set_phase(text, text),
  public.host_reset(text, boolean)
from public, anon, authenticated;

grant execute on function
  public.server_now(),
  public.join_game(uuid, text, jsonb),
  public.get_crowd(),
  public.send_feed(uuid, int, text),
  public.get_feed(bigint),
  public.host_set_chat(text, boolean),
  public.host_clear_chat(text),
  public.host_people(text),
  public.host_set_vip(text, text, boolean),
  public.submit_game(uuid, numeric),
  public.get_game_board(int),
  public.submit_vote(uuid, int),
  public.my_status(uuid),
  public.get_tally(text),
  public.get_leaderboard(int),
  public.lobby_info(),
  public.host_check(text),
  public.host_load_questions(text, jsonb),
  public.host_show_question(text, int),
  public.host_close(text),
  public.host_reveal(text),
  public.host_set_phase(text, text),
  public.host_reset(text, boolean)
to anon, authenticated;

-- ---------- 진행자 PIN 설정 ★ 여기를 바꾸세요 ★ -----------------------
-- 처음 설치할 때만 적용돼요. 이미 PIN이 있으면 바뀌지 않으니, 업데이트 때 다시 실행해도 안전합니다.
-- 나중에 PIN을 바꾸려면 이 줄 대신 다음을 실행하세요:
--   update public.host_secret set pin = '새PIN' where id = 1;
insert into public.host_secret (id, pin) values (1, 'CHANGE-ME-1234')
on conflict (id) do nothing;
