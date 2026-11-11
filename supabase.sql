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

-- ---------- 보안 (RLS) -------------------------------------------------
-- 참가자(anon 키)는 game 행 읽기만 가능. 나머지는 아래 함수(RPC)로만 접근.
alter table public.game        enable row level security;
alter table public.host_secret enable row level security;
alter table public.players     enable row level security;
alter table public.votes       enable row level security;
alter table public.results     enable row level security;

drop policy if exists "game is public" on public.game;
create policy "game is public" on public.game for select to anon, authenticated using (true);

revoke all on public.game, public.host_secret, public.players, public.votes, public.results
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
-- 퀴즈 정답: 500점 + 빠르기 보너스 최대 500점 (제한시간 대비 남은 비율)
create or replace view public.scores as
select p.id,
       p.nickname,
       coalesce(sum(
         case when r.kind = 'quiz' and v.choice = r.correct then
           500 + case when r.time_limit > 0
                      then greatest(0, round(500 * (1 - v.elapsed_ms::numeric / (r.time_limit * 1000))))::int
                      else 0 end
         else 0 end), 0)::int as score,
       count(*) filter (where r.kind = 'quiz' and v.choice = r.correct)::int as correct_cnt
from public.players p
left join public.votes   v on v.player_id = p.id
left join public.results r on r.q_index = v.q_index
group by p.id, p.nickname;

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
                        where v.player_id = p_id and v.q_index = g.q_index))
  from ranked r where r.id = p_id
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
          or coalesce(g.question ->> 'kind', 'quiz') = 'poll'
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
    'voted',   (select count(*) from votes where q_index = g.q_index),
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
    'recent',  coalesce((select jsonb_agg(jsonb_build_object('id', left(id::text, 8), 'n', nickname, 'a', avatar) order by created_at desc)
                         from (select id, nickname, avatar, created_at from players
                               order by created_at desc limit 40) t), '[]'::jsonb))
$$;

-- 결과 화면용: 누가 어느 보기에 모였는지 (퀴즈는 정답 공개 후, 투표는 실시간)
create or replace function public.get_crowd()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g game;
begin
  select * into g from game where id = 1;
  if g.q_index < 0 or not (g.phase in ('reveal','leaderboard','end')
                           or coalesce(g.question ->> 'kind', 'quiz') = 'poll') then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('c', v.choice, 'n', p.nickname, 'a', p.avatar) order by v.elapsed_ms)
                   from votes v join players p on p.id = v.player_id
                   where v.q_index = g.q_index), '[]'::jsonb);
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
    if kind not in ('quiz','poll') then
      raise exception '%번 문항: kind는 quiz 또는 poll 이어야 합니다.', i; end if;
    if coalesce(btrim(q ->> 'text'), '') = '' then
      raise exception '%번 문항: text가 비어 있습니다.', i; end if;
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

  update game set
    phase      = 'question',
    q_index    = p_index,
    question   = jsonb_build_object(
                   'text',       q -> 'text',
                   'options',    q -> 'options',
                   'kind',       kind,
                   'time_limit', coalesce((q ->> 'time_limit')::int, case when kind = 'poll' then 0 else 20 end)),
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

  insert into results (q_index, kind, correct, time_limit)
  values (g.q_index, g.question ->> 'kind', ans, coalesce((g.question ->> 'time_limit')::int, 0))
  on conflict (q_index) do update
    set kind = excluded.kind, correct = excluded.correct, time_limit = excluded.time_limit;

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
  delete from results where true;
  if not p_keep_players then delete from players where true; end if;
  update game set phase = 'lobby', q_index = -1, question = null, correct = null,
                  started_at = null, updated_at = now() where id = 1;
end $$;

-- ---------- 함수 실행 권한 --------------------------------------------
revoke execute on function
  public._check_pin(text),
  public._avatar(jsonb),
  public.server_now(),
  public.join_game(uuid, text, jsonb),
  public.get_crowd(),
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
insert into public.host_secret (id, pin) values (1, 'CHANGE-ME-1234')
on conflict (id) do update set pin = excluded.pin;
