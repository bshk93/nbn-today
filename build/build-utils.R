library(dplyr)
library(tidyr)
library(stringr)
library(purrr)
library(readr)
library(glue)
library(magrittr)
library(rlang)
library(lubridate)

# ── Data loading / cleaning ───────────────────────────────────────────────────

check_allstats <- function(allstats) {
  bad_minute_games <- allstats %>%
    group_by(TEAM, DATE, OPP) %>%
    summarize(t_min = sum(M)) %>%
    filter(t_min != 240 & t_min != 265 & t_min != 290 & t_min != 315)

  if (nrow(bad_minute_games) > 0) {
    warning(glue("There are {nrow(bad_minute_games)} game(s) where total minutes doesn't make sense: {str_c(bad_minute_games$t_min, collapse = ', ')}"))
  }

  bad_sanity_checks <- allstats %>%
    filter(OR > R | DR > R | FGM > FGA | `3PM` > `3PA` | FTM > FTA | PF > 6 | P != FTM + 2*FGM + 1*`3PM`)

  if (nrow(bad_sanity_checks) > 0) {
    warning(glue("There are {nrow(bad_sanity_checks)} row(s) where the numbers don't make sense: {str_c(bad_sanity_checks$PLAYER, collapse = ', ')}"))
  }

  bad_missing <- allstats %>%
    filter(if_any(c(DATE, PLAYER, M, P, R, A, S, B, TO, FGA, FGM, `3PA`, `3PM`, FTM, FTA, PF), is.na))

  if (nrow(bad_missing) > 0) {
    warning(glue("There are {nrow(bad_missing)} row(s) with missing data."))
  }

  list(
    data = allstats,
    errors = list(
      bad_minute_games  = bad_minute_games,
      bad_sanity_checks = bad_sanity_checks,
      bad_missing       = bad_missing,
      games = bind_rows(
        select(bad_minute_games,  "TEAM", "DATE") %>% mutate(REASON = "bad total minutes"),
        select(bad_sanity_checks, "TEAM", "DATE") %>% mutate(REASON = "data don't make sense"),
        select(bad_missing,       "TEAM", "DATE") %>% mutate(REASON = "missing data")
      ) %>% distinct()
    )
  )
}

clean_allstats <- function(dfs) {
  dfs_bind <- dfs %>%
    bind_rows() %>%
    select(-any_of(c("...27", "V27", "...28", "V28"))) %>%
    mutate(
      FG   = str_c(FGM, "-", FGA),
      `3P` = str_c(`3PM`, "-", `3PA`),
      FT   = str_c(FTM, "-", FTA),
      GMSC = P + (0.4 * FGM) - (0.7 * FGA) - (0.4 * (FTA - FTM)) + (0.7 * OR) +
             (0.3 * DR) + S + (0.7 * A) + (0.7 * B) - (0.4 * PF) - TO,
      TS   = 0.5 * P / (FGA + .475 * FTA)
    ) %>%
    mutate(PLAYER = case_when(
      PLAYER == "KANTER, ENES"         ~ "FREEDOM, ENES",
      PLAYER == "BAMBA, MO"            ~ "BAMBA, MOHAMED",
      PLAYER == "CAREY JR., VERNON"    ~ "CAREY, VERNON",
      PLAYER == "CHAMAGNIE, JUSTIN"    ~ "CHAMPAGNIE, JUSTIN",
      PLAYER == "HAMMONDS, RAYSHON"    ~ "HAMMONDS, RAYSHAUN",
      PLAYER == "MATTHEWS, WES"        ~ "MATTHEWS, WESLEY",
      PLAYER == "O'NEALE, ROYCE"       ~ "ONEALE, ROYCE",
      PLAYER == "PIPPEN, SCOTTIE"      ~ "PIPPEN, SCOTTY",
      PLAYER == "ROBINSON, GLENNN"     ~ "ROBINSON, GLENN",
      PLAYER == "WHITE, COLBY"         ~ "WHITE, COBY",
      PLAYER == "BERTANS,DAVIS"        ~ "BERTANS, DAVIS",
      PLAYER == "HIGHSMITH, HAYDEN"    ~ "HIGHSMITH, HAYWOOD",
      PLAYER == "THOMAS, CAMERON"      ~ "THOMAS, CAM",
      PLAYER == "REDDISH, CAMERON"     ~ "REDDISH, CAM",
      TRUE ~ PLAYER
    )) %>%
    mutate(GMSC = round(GMSC, 2)) %>%
    arrange(PLAYER, DATE)

  if (!("OPP_RAW" %in% names(dfs_bind))) {
    dfs_bind <- dfs_bind %>%
      mutate(OPP_RAW = str_replace(OPP, "^@", ""))
  }

  dfs_bind
}

load_allstats <- function(playoffs = FALSE, data_dir = Sys.getenv("NBS_DATA_DIR", "/var/lib/nothing-but-stats")) {
  ptrn <- "allstats-\\d"
  pstr <- ""
  if (playoffs) {
    ptrn <- "allstats-playoffs"
    pstr <- " Playoffs"
  }

  list.files(data_dir, ptrn) %>%
    map(function(fp) {
      tmp_season <- as.numeric(str_extract(fp, "\\d{2}\\."))
      data.table::fread(file.path(data_dir, fp)) %>%
        tibble() %>%
        mutate_if(is.numeric, as.numeric) %>%
        mutate(DATE = as.Date(DATE)) %>%
        mutate(SEASON = str_c(tmp_season - 1, "-", tmp_season, pstr)) %>%
        filter(!is.na(SEASON))
    })
}

# ── Conference / division helpers ─────────────────────────────────────────────

get_conference <- function(team) {
  case_when(
    team %in% c("MIL", "IND", "BOS", "BKN", "ATL", "ORL", "MIA", "PHI", "WAS",
                "TOR", "CHI", "CHA", "CLE", "NYK", "DET") ~ "East",
    team %in% c("HOU", "SAC", "GSW", "LAL", "DAL", "LAC", "MIN", "POR", "DEN",
                "NOP", "PHX", "OKC", "SAS", "UTA", "MEM") ~ "West"
  )
}

get_division <- function(team) {
  case_when(
    team %in% c("NYK", "TOR", "BOS", "PHI", "BKN") ~ "Atlantic",
    team %in% c("DET", "CLE", "MIL", "CHI", "IND") ~ "Central",
    team %in% c("ORL", "ATL", "MIA", "CHA", "WAS") ~ "Southeast",
    team %in% c("OKC", "DEN", "MIN", "UTA", "POR") ~ "Northwest",
    team %in% c("LAL", "PHX", "GSW", "SAC", "LAC") ~ "Pacific",
    team %in% c("SAS", "HOU", "MEM", "DAL", "NOP") ~ "Southwest"
  )
}

# ── Standings / team stats ────────────────────────────────────────────────────

join_opponent_scores <- function(df, join_by = c("DATE", "OPP")) {
  df %>%
    left_join(
      df %>% select(all_of(setdiff(join_by, "OPP")), OPP = TEAM, OPP_PTS = TEAM_PTS),
      by = join_by
    )
}

compute_standings <- function(season_df) {
  x <- season_df %>%
    group_by(DATE, TEAM, OPP) %>%
    summarize(TEAM_PTS = sum(P), .groups = "drop") %>%
    mutate(OPP = str_replace(OPP, "@", ""))

  games <- x %>%
    join_opponent_scores() %>%
    mutate(
      WIN      = TEAM_PTS > OPP_PTS,
      LOSS     = TEAM_PTS < OPP_PTS,
      CONF     = get_conference(TEAM),
      DIV      = get_division(TEAM),
      OPP_CONF = get_conference(OPP),
      OPP_DIV  = get_division(OPP)
    )

  standings <- games %>%
    group_by(TEAM) %>%
    summarize(
      W      = sum(WIN),
      L      = sum(LOSS),
      CONF   = first(CONF),
      DIV    = first(DIV),
      CONF_W = sum(WIN & CONF == OPP_CONF),
      CONF_L = sum(LOSS & CONF == OPP_CONF),
      DIV_W  = sum(WIN & DIV == OPP_DIV),
      DIV_L  = sum(LOSS & DIV == OPP_DIV),
      PPG    = mean(TEAM_PTS),
      OPPG   = mean(OPP_PTS),
      .groups = "drop"
    ) %>%
    mutate(
      PCT      = W / (W + L),
      CONF_PCT = CONF_W / (CONF_W + CONF_L),
      DIV_PCT  = DIV_W / (DIV_W + DIV_L),
      DIFF     = PPG - OPPG
    )

  h2h <- games %>%
    group_by(TEAM, OPP) %>%
    summarize(W = sum(WIN), L = sum(LOSS), PCT = W / (W + L), .groups = "drop")

  division_winners <- standings %>%
    group_by(DIV) %>%
    arrange(desc(PCT), desc(CONF_PCT), desc(DIFF)) %>%
    slice(1) %>%
    mutate(DIV_WINNER = TRUE) %>%
    select(TEAM, DIV_WINNER)

  standings <- standings %>%
    left_join(division_winners, by = "TEAM") %>%
    mutate(DIV_WINNER = if_else(is.na(DIV_WINNER), FALSE, DIV_WINNER))

  resolve_nba_ties <- function(df, h2h) {
    if (nrow(df) == 1) return(df)
    teams <- df$TEAM
    h2h_tied <- h2h %>%
      filter(TEAM %in% teams, OPP %in% teams) %>%
      group_by(TEAM) %>%
      summarize(H2H_PCT = mean(PCT, na.rm = TRUE), .groups = "drop")
    df2 <- df %>%
      left_join(h2h_tied, by = "TEAM") %>%
      mutate(H2H_PCT = replace_na(H2H_PCT, 0))
    ordering <- df2 %>%
      arrange(desc(H2H_PCT), desc(DIV_WINNER), desc(DIV_PCT), desc(CONF_PCT), desc(DIFF))
    top <- ordering[1, ]
    tied <- ordering %>%
      filter(H2H_PCT == top$H2H_PCT, DIV_WINNER == top$DIV_WINNER,
             DIV_PCT == top$DIV_PCT, CONF_PCT == top$CONF_PCT, DIFF == top$DIFF)
    result <- if (nrow(tied) == nrow(ordering)) {
      ordering
    } else {
      bind_rows(top, resolve_nba_ties(ordering[-1, ] %>% select(-H2H_PCT), h2h))
    }
    result %>% select(-H2H_PCT)
  }

  standings %>%
    group_by(CONF, W, L) %>%
    group_modify(~ resolve_nba_ties(.x, h2h)) %>%
    ungroup() %>%
    group_by(CONF) %>%
    arrange(CONF, desc(W), .by_group = TRUE) %>%
    mutate(GB = (max(W - L) - (W - L)) / 2, SEED = row_number()) %>%
    ungroup() %>%
    transmute(
      SEED = paste0(CONF, "-", SEED), TEAM, GB, W, L,
      PCT  = round(PCT,  3),
      PPG  = round(PPG,  1),
      OPPG = round(OPPG, 1),
      DIFF = round(DIFF, 1)
    )
}

compute_team_stats <- function(season_df) {
  season_df %>%
    group_by(TEAM, DATE) %>%
    summarize(
      P = sum(P), R = sum(R), A = sum(A), S = sum(S), B = sum(B),
      TO = sum(TO), PF = sum(PF), `3PM` = sum(`3PM`), `3PA` = sum(`3PA`),
      .groups = "drop"
    ) %>%
    group_by(TEAM) %>%
    summarize(
      PPG = mean(P), RPG = mean(R), APG = mean(A), SPG = mean(S), BPG = mean(B),
      TOPG = mean(TO), PFPG = mean(PF), `3PMPG` = mean(`3PM`), `3PAPG` = mean(`3PA`)
    ) %>%
    mutate_if(is.numeric, round, 2) %>%
    mutate(`3PPCT` = round(`3PMPG` / `3PAPG`, 3))
}

# ── Award metadata ────────────────────────────────────────────────────────────

get_champions <- function(dfs_playoffs) {
  champions <- dfs_playoffs %>%
    filter(!is.na(WL)) %>%
    distinct(SEASON, TEAM, DATE, WL) %>%
    group_by(SEASON, TEAM) %>%
    summarize(po_wins = sum(WL == "W"), .groups = "drop") %>%
    filter(po_wins >= 16L) %>%
    select(SEASON, TEAM)
  dfs_playoffs %>% inner_join(champions, by = c("SEASON", "TEAM"))
}

get_runners_up <- function() {
  tribble(
    ~SEASON,            ~RUNNER_UP, ~EAST_RUNNER_UP, ~WEST_RUNNER_UP,
    '20-21 Playoffs',   'DAL',      'MIL',           'DEN',
    '21-22 Playoffs',   'NOP',      'WAS',           'GSW',
    '22-23 Playoffs',   'CLE',      'BKN',           'DEN',
    '23-24 Playoffs',   'PHX',      'NYK',           'UTA',
    '24-25 Playoffs',   'MIL',      'ATL',           'OKC'
  )
}

.get_award_rows <- function(key) {
  path <- file.path(Sys.getenv("NBS_DATA_DIR", "/var/lib/nothing-but-stats"), "awards-history.json")
  if (!file.exists(path)) return(tibble(PLAYER = character(), SEASON = character()))
  history <- jsonlite::read_json(path)
  bind_rows(lapply(names(history), function(s) {
    players <- history[[s]][[key]]
    if (is.null(players) || length(players) == 0L) return(NULL)
    tibble(PLAYER = unlist(players), SEASON = s)
  }))
}

get_allstars  <- function() .get_award_rows("All-Star")
get_mvp       <- function() .get_award_rows("MVP")
get_dpoy      <- function() .get_award_rows("DPOY")
get_roy       <- function() .get_award_rows("ROTY")
get_6moy      <- function() .get_award_rows("6MOY")
get_mip       <- function() .get_award_rows("MIP")
get_allnbn1   <- function() .get_award_rows("All-NBN-1")
get_allnbn2   <- function() .get_award_rows("All-NBN-2")
get_allnbn3   <- function() .get_award_rows("All-NBN-3")
get_alldef    <- function() .get_award_rows("All-Defense")
get_allrookie <- function() .get_award_rows("All-Rookie")

get_coty <- function() {
  tribble(
    ~AWARD,                   ~TEAM, ~SEASON,
    'COTY (That1gal)',        'SAC',  '20-21',
    'COTY (Kid Monotone)',    'IND',  '21-22',
    'COTY (bryn and Q)',      'SAS',  '22-23',
    'COTY (Schu)',            'UTA',  '23-24',
    'COTY (CF)',              'MEM',  '24-25'
  )
}

get_foty <- function() {
  tribble(
    ~TEAM,  ~SEASON, ~AWARD,
    'ATL',  '20-21', 'FOTY',
    'NOP',  '21-22', 'FOTY',
    'SAS',  '22-23', 'FOTY',
    'UTA',  '23-24', 'FOTY',
    'MEM',  '24-25', 'FOTY'
  )
}

get_owners <- function() {
  data_dir <- Sys.getenv("NBS_DATA_DIR", "/var/lib/nothing-but-stats")

  season_year <- function(d) {
    yr <- as.integer(format(d, "%Y"))
    mo <- as.integer(format(d, "%m"))
    yr - as.integer(mo < 6L)
  }

  fmt_season <- function(sy) {
    paste0(sprintf("%02d", sy %% 100L), "-", sprintf("%02d", (sy + 1L) %% 100L))
  }

  read_csv(file.path(data_dir, "owners.csv"), show_col_types = FALSE) %>%
    mutate(start_date = mdy(start_date), TEAM = toupper(team)) %>%
    arrange(TEAM, start_date) %>%
    group_by(TEAM) %>%
    mutate(
      end_date = if_else(row_number() < n(), lead(start_date) - days(1), as.Date(Sys.Date()))
    ) %>%
    ungroup() %>%
    rowwise() %>%
    mutate(SEASON = list(fmt_season(season_year(start_date):season_year(end_date)))) %>%
    unnest(SEASON) %>%
    select(SEASON, TEAM, OWNER = owner) %>%
    distinct()
}

get_all_player_awards <- function(player = NULL) {
  x <- bind_rows(
    get_allstars()  %>% select(PLAYER, SEASON) %>% mutate(AWARD = "All-Star"),
    get_mvp()       %>% select(PLAYER, SEASON) %>% mutate(AWARD = "Most Valuable Player"),
    get_dpoy()      %>% select(PLAYER, SEASON) %>% mutate(AWARD = "Defensive Player of the Year"),
    get_6moy()      %>% select(PLAYER, SEASON) %>% mutate(AWARD = "Sixth Man of the Year"),
    get_roy()       %>% select(PLAYER, SEASON) %>% mutate(AWARD = "Rookie of the Year"),
    get_mip()       %>% select(PLAYER, SEASON) %>% mutate(AWARD = "Most Improved Player"),
    get_allnbn1()   %>% select(PLAYER, SEASON) %>% mutate(AWARD = "All-NBN First Team"),
    get_allnbn2()   %>% select(PLAYER, SEASON) %>% mutate(AWARD = "All-NBN Second Team"),
    get_allnbn3()   %>% select(PLAYER, SEASON) %>% mutate(AWARD = "All-NBN Third Team"),
    get_alldef()    %>% select(PLAYER, SEASON) %>% mutate(AWARD = "All-Defense"),
    get_allrookie() %>% select(PLAYER, SEASON) %>% mutate(AWARD = "All-Rookie")
  )
  if (!is.null(player)) x %>% filter(PLAYER == player) else x
}

# ── CSV write helpers ─────────────────────────────────────────────────────────

write_league_history <- function(dfs, dfs_playoffs, team_ratings, out_dir) {
  season_totals <- dfs %>%
    group_by(SEASON, PLAYER) %>%
    summarize(
      P     = sum(P,     na.rm = TRUE),
      R     = sum(R,     na.rm = TRUE),
      A     = sum(A,     na.rm = TRUE),
      S     = sum(S,     na.rm = TRUE),
      B     = sum(B,     na.rm = TRUE),
      `3PM` = sum(`3PM`, na.rm = TRUE),
      .groups = "drop"
    )

  stat_leader <- function(stat) {
    season_totals %>%
      group_by(SEASON) %>%
      slice_max(.data[[stat]], n = 1, with_ties = FALSE) %>%
      ungroup() %>%
      transmute(SEASON, val = paste0(PLAYER, " (", .data[[stat]], ")"))
  }

  rating_leaders <- team_ratings %>%
    ungroup() %>%
    group_by(SEASON) %>%
    summarize(
      BEST_OFF     = paste0(TEAM[which.max(OFF_RTG)], " (", sprintf("%+.2f", max(OFF_RTG)), ")"),
      BEST_DEF     = paste0(TEAM[which.max(DEF_RTG)], " (", sprintf("%+.2f", max(DEF_RTG)), ")"),
      BEST_OVERALL = paste0(TEAM[which.max(TOT_RTG)], " (", sprintf("%+.2f", max(TOT_RTG)), ")"),
      .groups = "drop"
    )

  history_df <- tibble(SEASON = sort(unique(dfs$SEASON))) %>%
    left_join(
      dfs_playoffs %>%
        filter(!is.na(WL)) %>%
        group_by(SEASON, TEAM) %>%
        summarize(po_wins = sum(WL == "W"), .groups = "drop") %>%
        filter(po_wins >= 16L) %>%
        mutate(SEASON = str_remove(SEASON, " Playoffs")) %>%
        select(SEASON, CHAMPION = TEAM),
      by = "SEASON"
    ) %>%
    left_join(
      get_runners_up() %>%
        mutate(SEASON = str_remove(SEASON, " Playoffs")) %>%
        select(SEASON, RUNNER_UP, EAST_RUNNER_UP, WEST_RUNNER_UP),
      by = "SEASON"
    ) %>%
    left_join(get_mvp()  %>% select(SEASON, MVP  = PLAYER), by = "SEASON") %>%
    left_join(get_dpoy() %>% select(SEASON, DPOY = PLAYER), by = "SEASON") %>%
    left_join(get_roy()  %>% select(SEASON, ROTY = PLAYER), by = "SEASON") %>%
    left_join(get_mip()  %>% select(SEASON, MIP  = PLAYER), by = "SEASON") %>%
    left_join(get_foty() %>% select(SEASON, FOTY = TEAM),   by = "SEASON") %>%
    left_join(
      get_coty() %>%
        mutate(COTY = paste0(str_extract(AWARD, "(?<=\\().*(?=\\))"), " (", TEAM, ")")) %>%
        select(SEASON, COTY),
      by = "SEASON"
    ) %>%
    left_join(stat_leader("P")   %>% rename(PTS_LEADER = val), by = "SEASON") %>%
    left_join(stat_leader("R")   %>% rename(REB_LEADER = val), by = "SEASON") %>%
    left_join(stat_leader("A")   %>% rename(AST_LEADER = val), by = "SEASON") %>%
    left_join(stat_leader("S")   %>% rename(STL_LEADER = val), by = "SEASON") %>%
    left_join(stat_leader("B")   %>% rename(BLK_LEADER = val), by = "SEASON") %>%
    left_join(stat_leader("3PM") %>% rename(TPM_LEADER = val), by = "SEASON") %>%
    left_join(rating_leaders, by = "SEASON") %>%
    arrange(SEASON)

  write_csv(history_df, file.path(out_dir, "league-history.csv"))
}

write_team_profiles <- function(dfs, dfs_playoffs, standings_list, team_ratings, out_dir) {
  teams <- sort(unique(dfs$TEAM))

  po_wins <- dfs_playoffs %>%
    distinct(SEASON, TEAM, DATE, WL) %>%
    mutate(SEASON = str_remove(SEASON, " Playoffs")) %>%
    group_by(SEASON, TEAM) %>%
    summarize(PO_W = sum(WL == "W", na.rm = TRUE), .groups = "drop")

  playoff_result_table <- dfs_playoffs %>%
    mutate(SEASON = str_remove(SEASON, " Playoffs")) %>%
    distinct(SEASON, TEAM) %>%
    left_join(po_wins, by = c("SEASON", "TEAM")) %>%
    mutate(
      PO_W           = replace_na(PO_W, 0L),
      PLAYOFF_RESULT = case_when(
        PO_W >= 16 ~ "Champion",
        PO_W >= 12 ~ "Runner-Up",
        PO_W >= 8  ~ "Conf Finals",
        PO_W >= 4  ~ "Second Round",
        TRUE       ~ "First Round"
      )
    )

  foty <- get_foty() %>% select(TEAM, SEASON)
  coty <- get_coty() %>% select(TEAM, SEASON)

  for (team in teams) {
    slug <- tolower(team)

    players_df <- dfs %>%
      filter(TEAM == team) %>%
      group_by(PLAYER) %>%
      summarize(
        GP       = n(),
        GMSC_TOT = round(sum(GMSC,   na.rm = TRUE), 1),
        GMSC_AVG = round(mean(GMSC,  na.rm = TRUE), 2),
        PPG      = round(mean(P,     na.rm = TRUE), 1),
        RPG      = round(mean(R,     na.rm = TRUE), 1),
        APG      = round(mean(A,     na.rm = TRUE), 1),
        SPG      = round(mean(S,     na.rm = TRUE), 1),
        BPG      = round(mean(B,     na.rm = TRUE), 1),
        `3PMPG`  = round(mean(`3PM`, na.rm = TRUE), 1),
        SEASONS  = paste(sort(unique(SEASON)), collapse = ", "),
        .groups  = "drop"
      ) %>%
      arrange(desc(GMSC_TOT)) %>%
      slice_head(n = 100)

    write_csv(players_df, file.path(out_dir, paste0(slug, "-players.csv")))

    seasons_df <- map_dfr(names(standings_list), function(s) {
      row <- standings_list[[s]] %>% filter(TEAM == team)
      if (nrow(row) == 0) return(NULL)
      row %>% mutate(SEASON = s, SEED_NUM = as.integer(str_extract(SEED, "\\d+$")))
    }) %>%
      left_join(
        team_ratings %>% ungroup() %>% filter(TEAM == team) %>% select(SEASON, OFF_RTG, DEF_RTG),
        by = "SEASON"
      ) %>%
      left_join(
        playoff_result_table %>% filter(TEAM == team) %>% select(SEASON, PLAYOFF_RESULT),
        by = "SEASON"
      ) %>%
      left_join(foty %>% filter(TEAM == team) %>% transmute(SEASON, FOTY = TRUE), by = "SEASON") %>%
      left_join(coty %>% filter(TEAM == team) %>% transmute(SEASON, COTY = TRUE), by = "SEASON") %>%
      mutate(
        PLAYOFF_RESULT = replace_na(PLAYOFF_RESULT, "Missed"),
        FOTY           = replace_na(FOTY, FALSE),
        COTY           = replace_na(COTY, FALSE)
      ) %>%
      select(SEASON, W, L, PCT, PPG, OPPG, DIFF, SEED, SEED_NUM,
             OFF_RTG, DEF_RTG, PLAYOFF_RESULT, FOTY, COTY) %>%
      arrange(SEASON)

    write_csv(seasons_df, file.path(out_dir, paste0(slug, "-seasons.csv")))
  }
}

write_h2h_matrix <- function(dfs, dfs_playoffs, output_dir) {
  teams <- sort(unique(dfs$TEAM))

  get_game_level <- function(df) {
    df %>%
      mutate(OPP_CLEAN = str_replace(OPP, "@", "")) %>%
      distinct(SEASON, DATE, TEAM, OPP_CLEAN, WL) %>%
      filter(!is.na(WL), !is.na(OPP_CLEAN), OPP_CLEAN != "")
  }

  get_counts <- function(games) {
    games %>%
      group_by(TEAM, OPP_CLEAN) %>%
      summarise(W = sum(WL == "W"), L = sum(WL == "L"), .groups = "drop")
  }

  build_matrix <- function(counts) {
    expand.grid(TEAM = teams, OPP_RAW = teams, stringsAsFactors = FALSE) %>%
      filter(TEAM != OPP_RAW) %>%
      left_join(counts, by = c("TEAM", "OPP_RAW" = "OPP_CLEAN")) %>%
      mutate(W = coalesce(W, 0L), L = coalesce(L, 0L), RECORD = paste0(W, "-", L)) %>%
      select(TEAM, OPP_RAW, RECORD) %>%
      pivot_wider(names_from = OPP_RAW, values_from = RECORD, values_fill = "") %>%
      arrange(TEAM) %>%
      select(TEAM, all_of(teams))
  }

  dfs_all <- bind_rows(dfs, dfs_playoffs)
  write_csv(build_matrix(get_counts(get_game_level(dfs_all))),
            file.path(output_dir, "h2h-alltime.csv"))
  write_csv(build_matrix(get_counts(get_game_level(dfs_playoffs))),
            file.path(output_dir, "h2h-playoffs.csv"))
}

write_owner_h2h_matrix <- function(dfs, dfs_playoffs, owner_data, output_dir) {
  teams  <- sort(unique(dfs$TEAM))
  owners <- sort(unique(owner_data$owner))

  games <- bind_rows(dfs, dfs_playoffs) %>%
    mutate(OPP_CLEAN = str_replace(OPP, "@", ""), DATE = as.Date(DATE)) %>%
    distinct(DATE, TEAM, OPP_CLEAN, WL) %>%
    filter(!is.na(WL), !is.na(OPP_CLEAN), OPP_CLEAN != "")

  owner_game_counts <- owner_data %>%
    group_by(owner) %>%
    group_modify(~ {
      periods <- .x
      games %>%
        inner_join(periods %>% select(TEAM, start_date, end_date), by = "TEAM") %>%
        filter(DATE >= start_date & DATE <= end_date) %>%
        group_by(OPP_CLEAN) %>%
        summarise(W = sum(WL == "W"), L = sum(WL == "L"), .groups = "drop")
    }) %>%
    ungroup()

  expand.grid(owner = owners, OPP_CLEAN = teams, stringsAsFactors = FALSE) %>%
    left_join(owner_game_counts, by = c("owner", "OPP_CLEAN")) %>%
    mutate(W = coalesce(W, 0L), L = coalesce(L, 0L), RECORD = paste0(W, "-", L)) %>%
    select(owner, OPP_CLEAN, RECORD) %>%
    pivot_wider(names_from = OPP_CLEAN, values_from = RECORD, values_fill = "") %>%
    arrange(owner) %>%
    rename(OWNER = owner) %>%
    select(OWNER, all_of(teams)) %>%
    write_csv(file.path(output_dir, "h2h-owners.csv"))
}
