args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 3) {
  rlang::abort("Three arguments required: season, playoffs_from, through")
}

season        <- args[1]  # e.g. "25-26" or ""
playoffs_from <- args[2]  # e.g. "2026-04-13" or ""
through       <- args[3]  # e.g. "2026-05-10" or ""

# Set-Up ----
BUILD_DIR <- Sys.getenv("NBN_BUILD_DIR", {
  args_all    <- commandArgs(trailingOnly = FALSE)
  script_flag <- grep("^--file=", args_all, value = TRUE)
  if (length(script_flag)) dirname(sub("^--file=", "", script_flag[1])) else "build"
})
source(file.path(BUILD_DIR, "build-utils.R"))
source(file.path(BUILD_DIR, "preprocess-utils.R"))

DATA_DIR  <- Sys.getenv("NBS_DATA_DIR",  "/var/lib/nothing-but-stats")
REPO_ROOT <- Sys.getenv("NBN_REPO_ROOT", dirname(BUILD_DIR))

today        <- Sys.Date()
current_year <- as.numeric(format(today, "%Y"))
cutoff_date  <- as.Date(paste0(current_year, "-09-30"))

if (season == "") {
  season <- if (today <= cutoff_date) {
    paste0(substr(current_year - 1, 3, 4), "-", substr(current_year, 3, 4))
  } else {
    paste0(substr(current_year, 3, 4), "-", substr(current_year + 1, 3, 4))
  }
}
season_code   <- str_extract(season, "\\d{2}-\\d{2}")
season_suffix <- str_extract(season, "\\d{2}$")

if (through == "") {
  through <- today
  inform(glue("Through date defaulted to today ({today})."))
}

# Build Phase ----
reg_csv <- file.path(DATA_DIR, glue("allstats-{season_code}.csv"))
if (!file.exists(reg_csv)) {
  abort(glue("Regular season CSV not found: {reg_csv}. Submit box scores via /boxscores/submit first."))
}
inform(glue("Loading current season from {reg_csv}"))
current_reg_raw <- data.table::fread(reg_csv) %>%
  tibble() %>%
  mutate(DATE = as.Date(DATE))

playoff_csv <- file.path(DATA_DIR, glue("allstats-playoffs-{season_suffix}.csv"))
current_playoff_raw <- if (file.exists(playoff_csv)) {
  inform(glue("Loading playoff data from {playoff_csv}"))
  data.table::fread(playoff_csv) %>% tibble() %>% mutate(DATE = as.Date(DATE))
} else {
  NULL
}

# Post-processing: load historical seasons from disk, inject current season from memory ----
hist_reg <- load_allstats() %>%
  discard(~ any(.x$SEASON == season, na.rm = TRUE))

hist_playoffs <- load_allstats(playoffs = TRUE) %>%
  discard(~ any(.x$SEASON == str_c(season, " Playoffs"), na.rm = TRUE))

fix_player_names <- function(df) {
  df %>% mutate(PLAYER = recode(PLAYER,
    "KILLIAN HAYES" = "HAYES, KILLIAN",
    "KOBE BROWN"    = "BROWN, KOBE"
  ))
}

dfs <- c(
  hist_reg,
  list(current_reg_raw %>% mutate(SEASON = season))
) %>%
  clean_allstats() %>%
  fix_player_names() %>%
  mutate(gametype = "REG", GAME = NA_integer_, ROUND = NA_integer_) %>%
  group_by(PLAYER) %>%
  mutate(ROOKIE = SEASON == min(SEASON)) %>%
  ungroup()

dfs_playoffs_items <- c(
  hist_playoffs,
  if (!is.null(current_playoff_raw) && nrow(current_playoff_raw) > 0)
    list(current_playoff_raw %>% mutate(SEASON = str_c(season, " Playoffs")))
  else
    list()
)
dfs_playoffs <- dfs_playoffs_items %>%
  clean_allstats() %>%
  fix_player_names() %>%
  mutate(gametype = "PLAYOFF", ROOKIE = NA)

dfs_all <- bind_rows(dfs, dfs_playoffs)

team_ratings <- calculate_team_offense_defense(dfs)

inform("Pre-computing standings and team stats for all seasons....")
seasons <- sort(unique(dfs$SEASON))
standings_list  <- list()
team_stats_list <- list()

for (s in seasons) {
  inform(glue("  Computing for season {s}..."))
  season_df <- dfs %>% filter(SEASON == s)
  standings_list[[s]]  <- compute_standings(season_df)
  team_stats_list[[s]] <- compute_team_stats(season_df)
}
inform(" * DONE")

inform("Building owner_stats.csv....")

owner_data <- read_csv(file.path(DATA_DIR, "owners.csv"), show_col_types = FALSE) %>%
  mutate(start_date = mdy(start_date), TEAM = toupper(team)) %>%
  select(-team) %>%
  arrange(TEAM, start_date) %>%
  group_by(TEAM) %>%
  mutate(
    end_date = if_else(
      row_number() < n(),
      lead(start_date) - days(1),
      as.Date(Sys.Date())
    )
  ) %>%
  ungroup()

game_data <- dfs_all %>%
  filter(!is.na(WL)) %>%
  distinct(TEAM, DATE, SEASON, WL, gametype) %>%
  mutate(DATE = as.Date(DATE))

team_game_counts <- dfs %>%
  mutate(OPP_RAW = str_replace(OPP, "@", "")) %>%
  distinct(SEASON, TEAM, OPP_RAW, DATE) %>%
  group_by(TEAM, SEASON) %>%
  summarize(n_games = n(), .groups = "drop")

owner_ratings <- team_ratings %>%
  left_join(team_game_counts, by = c("TEAM", "SEASON")) %>%
  mutate(
    year2 = as.integer(paste0("20", str_extract(SEASON, "\\d{2}$"))),
    midpoint_date = as.Date(paste0(year2, "-01-01"))
  ) %>%
  inner_join(
    owner_data %>% select(owner, TEAM, start_date, end_date),
    by = join_by(TEAM, midpoint_date >= start_date, midpoint_date <= end_date)
  ) %>%
  group_by(owner) %>%
  summarize(
    off_rtg = round(weighted.mean(OFF_RTG, n_games), 2),
    def_rtg = round(weighted.mean(DEF_RTG, n_games), 2),
    .groups = "drop"
  )

wl_stats <- owner_data %>%
  group_by(owner) %>%
  group_modify(~ {
    owner_periods <- .x
    owner_games <- game_data %>%
      inner_join(owner_periods %>% select(TEAM, start_date, end_date), by = "TEAM") %>%
      filter(DATE >= start_date & DATE <= end_date)
    po_games <- owner_games$SEASON[owner_games$gametype == "PLAYOFF"]
    tibble(
      teams               = str_c(sort(unique(owner_games$TEAM)), collapse = ", "),
      reg_w               = sum(owner_games$WL == "W" & owner_games$gametype == "REG",     na.rm = TRUE),
      reg_l               = sum(owner_games$WL == "L" & owner_games$gametype == "REG",     na.rm = TRUE),
      playoff_w           = sum(owner_games$WL == "W" & owner_games$gametype == "PLAYOFF", na.rm = TRUE),
      playoff_l           = sum(owner_games$WL == "L" & owner_games$gametype == "PLAYOFF", na.rm = TRUE),
      playoff_appearances = n_distinct(str_remove(po_games, " Playoffs"))
    )
  }) %>%
  ungroup()

reg_season_wl <- owner_data %>%
  group_by(owner) %>%
  group_modify(~ {
    periods <- .x
    game_data %>%
      filter(gametype == "REG") %>%
      inner_join(periods %>% select(TEAM, start_date, end_date), by = "TEAM") %>%
      filter(DATE >= start_date & DATE <= end_date) %>%
      mutate(
        yr     = as.integer(format(DATE, "%Y")),
        mo     = as.integer(format(DATE, "%m")),
        season = if_else(mo >= 6L,
          paste0(sprintf("%02d", yr %% 100L), "-", sprintf("%02d", (yr + 1L) %% 100L)),
          paste0(sprintf("%02d", (yr - 1L) %% 100L), "-", sprintf("%02d", yr %% 100L))
        )
      ) %>%
      group_by(season) %>%
      summarize(w = sum(WL == "W"), l = sum(WL == "L"), .groups = "drop") %>%
      filter(w + l > 0L)
  }) %>%
  ungroup() %>%
  mutate(pct = w / (w + l))

best_reg_season <- reg_season_wl %>%
  group_by(owner) %>%
  slice_max(pct, n = 1, with_ties = FALSE) %>%
  transmute(owner, best_reg_season = paste0(w, "-", l), best_reg_pct = pct) %>%
  ungroup()

worst_reg_season <- reg_season_wl %>%
  group_by(owner) %>%
  slice_min(pct, n = 1, with_ties = FALSE) %>%
  transmute(owner, worst_reg_season = paste0(w, "-", l), worst_reg_pct = pct) %>%
  ungroup()

season_meta <- reg_season_wl %>%
  group_by(owner) %>%
  summarize(seasons = n_distinct(season), .groups = "drop") %>%
  rename(OWNER = owner)

team_playoff_wins <- game_data %>%
  filter(gametype == "PLAYOFF") %>%
  mutate(season = str_remove(SEASON, " Playoffs")) %>%
  group_by(TEAM, season) %>%
  summarize(po_wins = sum(WL == "W"), .groups = "drop")

completed_seasons <- team_playoff_wins %>%
  filter(po_wins >= 16L) %>%
  pull(season) %>%
  unique()

playoff_participants <- dfs_playoffs %>%
  mutate(season = str_remove(SEASON, " Playoffs")) %>%
  distinct(season, TEAM)

playoff_depth <- get_owners() %>%
  rename(season = SEASON) %>%
  filter(season %in% completed_seasons) %>%
  inner_join(playoff_participants, by = c("season", "TEAM")) %>%
  left_join(team_playoff_wins, by = c("TEAM", "season")) %>%
  mutate(po_wins = replace_na(po_wins, 0L)) %>%
  group_by(OWNER) %>%
  summarize(
    po_r2          = sum(po_wins >= 4L),
    po_conf_finals = sum(po_wins >= 8L),
    po_finals      = sum(po_wins >= 12L),
    championships  = sum(po_wins >= 16L),
    .groups = "drop"
  )

owner_stats <- wl_stats %>%
  rename(OWNER = owner) %>%
  left_join(season_meta,      by = "OWNER") %>%
  left_join(playoff_depth,    by = "OWNER") %>%
  left_join(best_reg_season,  by = c("OWNER" = "owner")) %>%
  left_join(worst_reg_season, by = c("OWNER" = "owner")) %>%
  left_join(owner_ratings,    by = c("OWNER" = "owner")) %>%
  rename(owner = OWNER) %>%
  mutate(
    total_w     = reg_w + playoff_w,
    total_l     = reg_l + playoff_l,
    reg_pct     = round(reg_w / (reg_w + reg_l), 3),
    playoff_pct = if_else(playoff_w + playoff_l > 0, round(playoff_w / (playoff_w + playoff_l), 3), NA_real_),
    total_pct   = round(total_w / (total_w + total_l), 3),
    across(c(po_r2, po_conf_finals, po_finals, championships), ~ replace_na(.x, 0L))
  ) %>%
  select(owner, teams, seasons, best_reg_season, best_reg_pct, worst_reg_season, worst_reg_pct,
         reg_w, reg_l, reg_pct, playoff_w, playoff_l, playoff_pct,
         total_w, total_l, total_pct, playoff_appearances,
         po_r2, po_conf_finals, po_finals, championships,
         off_rtg, def_rtg) %>%
  arrange(desc(total_pct), desc(total_w))

write_csv(owner_stats, file.path(REPO_ROOT, "data", "owner_stats.csv"))
inform(" * DONE")

start_time <- Sys.time()
inform("Calculating league stats....")

inform("Writing league history CSV....")
write_league_history(dfs, dfs_playoffs, team_ratings, file.path(REPO_ROOT, "data"))
inform(" * DONE")

inform("Writing per-team profile CSVs....")
write_team_profiles(dfs, dfs_playoffs, standings_list, team_ratings, file.path(REPO_ROOT, "data"))
inform(" * DONE")

inform("Writing standings-history.csv....")
standings_history <- map_dfr(sort(unique(dfs$TEAM)), function(team) {
  fp <- file.path(REPO_ROOT, "data", paste0(tolower(team), "-seasons.csv"))
  if (!file.exists(fp)) return(NULL)
  read_csv(fp, show_col_types = FALSE) %>% mutate(TEAM = team)
}) %>%
  arrange(SEASON, SEED_NUM)
write_csv(standings_history, file.path(REPO_ROOT, "standings", "standings-history.csv"))
inform(" * DONE")

inform("Writing playoff-brackets.csv....")
if (nrow(dfs_playoffs) > 0) {
  playoff_series <- dfs_playoffs %>%
    filter(!is.na(ROUND), !is.na(OPP_TEAM), OPP_TEAM != "") %>%
    distinct(SEASON, TEAM, OPP_TEAM, DATE, WL, ROUND) %>%
    mutate(
      SEASON_BASE = str_remove(SEASON, " Playoffs"),
      T1 = pmin(TEAM, OPP_TEAM),
      T2 = pmax(TEAM, OPP_TEAM)
    ) %>%
    group_by(SEASON_BASE, ROUND, T1, T2) %>%
    summarize(
      T1_W = n_distinct(DATE[TEAM == first(T1) & WL == "W"]),
      T2_W = n_distinct(DATE[TEAM == first(T2) & WL == "W"]),
      .groups = "drop"
    ) %>%
    mutate(WINNER = if_else(T1_W >= T2_W, T1, T2)) %>%
    left_join(standings_history %>% select(SEASON, TEAM, SEED, SEED_NUM),
              by = c("SEASON_BASE" = "SEASON", "T1" = "TEAM")) %>%
    rename(T1_SEED = SEED, T1_SEED_NUM = SEED_NUM) %>%
    left_join(standings_history %>% select(SEASON, TEAM, SEED, SEED_NUM),
              by = c("SEASON_BASE" = "SEASON", "T2" = "TEAM")) %>%
    rename(T2_SEED = SEED, T2_SEED_NUM = SEED_NUM) %>%
    rename(SEASON = SEASON_BASE) %>%
    arrange(SEASON, ROUND, T1_SEED_NUM)
  write_csv(playoff_series, file.path(REPO_ROOT, "standings", "playoff-brackets.csv"))

  playoff_margins <- dfs_playoffs %>%
    filter(!is.na(ROUND), !is.na(OPP_TEAM), OPP_TEAM != "") %>%
    distinct(SEASON, TEAM, OPP_TEAM, DATE, ROUND, TEAM_PTS, OPP_TEAM_PTS) %>%
    mutate(
      SEASON_BASE = str_remove(SEASON, " Playoffs"),
      T1 = pmin(TEAM, OPP_TEAM),
      T2 = pmax(TEAM, OPP_TEAM),
      MARGIN = abs(TEAM_PTS - OPP_TEAM_PTS)
    ) %>%
    distinct(SEASON_BASE, ROUND, T1, T2, DATE, MARGIN) %>%
    group_by(SEASON_BASE, ROUND, T1, T2) %>%
    summarize(
      GAMES      = n_distinct(DATE),
      AVG_MARGIN = round(mean(MARGIN), 1),
      .groups    = "drop"
    ) %>%
    rename(SEASON = SEASON_BASE) %>%
    inner_join(
      playoff_series %>%
        select(SEASON, ROUND, T1, T2, T1_W, T2_W, WINNER,
               T1_SEED, T1_SEED_NUM, T2_SEED, T2_SEED_NUM),
      by = c("SEASON", "ROUND", "T1", "T2")
    ) %>%
    filter(pmax(T1_W, T2_W) >= 4) %>%
    arrange(AVG_MARGIN)
  write_csv(playoff_margins, file.path(REPO_ROOT, "nbntv-classics", "playoff-series-margins.csv"))
} else {
  write_csv(
    tibble(SEASON=character(), ROUND=character(), T1=character(), T2=character(),
           T1_W=integer(), T2_W=integer(), WINNER=character(),
           T1_SEED=character(), T1_SEED_NUM=integer(),
           T2_SEED=character(), T2_SEED_NUM=integer()),
    file.path(REPO_ROOT, "standings", "playoff-brackets.csv")
  )
}
inform(" * DONE")

inform("Writing head-to-head matrix CSVs....")
write_h2h_matrix(dfs, dfs_playoffs, file.path(REPO_ROOT, "data"))
write_owner_h2h_matrix(dfs, dfs_playoffs, owner_data, file.path(REPO_ROOT, "data"))
inform(" * DONE")

inform("Writing player seasons CSV....")
bios_raw <- jsonlite::read_json(file.path(DATA_DIR, "player-bios.json"), simplifyVector = FALSE)
bio_data <- imap_dfr(bios_raw, function(p, slug) {
  tibble(
    NAME_KEY   = toupper(p[["name"]] %||% ""),
    PHOTO_URL  = p[["photo_url"]] %||% "",
    DOB        = p[["dob"]] %||% NA_character_,
    COLLEGE    = p[["college"]] %||% "",
    COUNTRY    = p[["country"]] %||% "",
    NBN_DFT_YR = p[["draft_year"]],
    NBN_DFT_R  = p[["draft_round"]],
    NBN_DFT_P  = p[["draft_pick"]]
  )
}) %>%
  mutate(
    DOB        = as.character(DOB),
    NBN_DFT_YR = suppressWarnings(as.integer(NBN_DFT_YR)),
    NBN_DFT_R  = suppressWarnings(as.integer(NBN_DFT_R)),
    NBN_DFT_P  = suppressWarnings(as.integer(NBN_DFT_P))
  ) %>%
  filter(NAME_KEY != "") %>%
  distinct(NAME_KEY, .keep_all = TRUE)

player_seasons <- dfs %>%
  group_by(PLAYER, SEASON, TEAM) %>%
  summarize(
    G         = n(),
    MIN       = sum(M,     na.rm = TRUE),
    PTS       = sum(P,     na.rm = TRUE),
    REB       = sum(R,     na.rm = TRUE),
    AST       = sum(A,     na.rm = TRUE),
    STL       = sum(S,     na.rm = TRUE),
    BLK       = sum(B,     na.rm = TRUE),
    TOV       = sum(TO,    na.rm = TRUE),
    PF        = sum(PF,    na.rm = TRUE),
    FGM       = sum(FGM,   na.rm = TRUE),
    FGA       = sum(FGA,   na.rm = TRUE),
    HIGH_P    = max(P,     na.rm = TRUE),
    HIGH_R    = max(R,     na.rm = TRUE),
    HIGH_A    = max(A,     na.rm = TRUE),
    HIGH_S    = max(S,     na.rm = TRUE),
    HIGH_B    = max(B,     na.rm = TRUE),
    HIGH_3PM  = max(`3PM`, na.rm = TRUE),
    HIGH_GMSC = max(GMSC,  na.rm = TRUE),
    `3PM`     = sum(`3PM`, na.rm = TRUE),
    `3PA`     = sum(`3PA`, na.rm = TRUE),
    FTM       = sum(FTM,   na.rm = TRUE),
    FTA       = sum(FTA,   na.rm = TRUE),
    GMSC      = sum(GMSC,  na.rm = TRUE),
    LAST_DATE = max(as.Date(DATE), na.rm = TRUE),
    .groups = "drop"
  ) %>%
  full_join(bio_data, by = c("PLAYER" = "NAME_KEY")) %>%
  filter((!is.na(NBN_DFT_YR) & NBN_DFT_YR != "") | !is.na(G)) %>%
  left_join(
    get_champions(dfs_playoffs) %>%
      group_by(PLAYER) %>%
      summarize(RINGS = n_distinct(SEASON), .groups = "drop"),
    by = "PLAYER"
  ) %>%
  mutate(
    RINGS  = replace_na(as.integer(RINGS), 0L),
    PLAYER = tools::toTitleCase(tolower(PLAYER)),
    SLUG   = gsub("[^a-z0-9-]", "", gsub(" ", "-", gsub(", ", "-", tolower(PLAYER))))
  ) %>%
  arrange(PLAYER, SEASON, LAST_DATE)
write_csv(player_seasons, file.path(REPO_ROOT, "players", "player_seasons.csv"))
inform(" * DONE")

inform("Writing player seasons playoffs CSV....")
player_seasons_playoffs <- dfs_playoffs %>%
  group_by(PLAYER, SEASON, TEAM) %>%
  summarize(
    G         = n(),
    MIN       = sum(M,     na.rm = TRUE),
    PTS       = sum(P,     na.rm = TRUE),
    REB       = sum(R,     na.rm = TRUE),
    AST       = sum(A,     na.rm = TRUE),
    STL       = sum(S,     na.rm = TRUE),
    BLK       = sum(B,     na.rm = TRUE),
    TOV       = sum(TO,    na.rm = TRUE),
    PF        = sum(PF,    na.rm = TRUE),
    FGM       = sum(FGM,   na.rm = TRUE),
    FGA       = sum(FGA,   na.rm = TRUE),
    HIGH_P    = max(P,     na.rm = TRUE),
    HIGH_R    = max(R,     na.rm = TRUE),
    HIGH_A    = max(A,     na.rm = TRUE),
    HIGH_S    = max(S,     na.rm = TRUE),
    HIGH_B    = max(B,     na.rm = TRUE),
    HIGH_3PM  = max(`3PM`, na.rm = TRUE),
    HIGH_GMSC = max(GMSC,  na.rm = TRUE),
    `3PM`     = sum(`3PM`, na.rm = TRUE),
    `3PA`     = sum(`3PA`, na.rm = TRUE),
    FTM       = sum(FTM,   na.rm = TRUE),
    FTA       = sum(FTA,   na.rm = TRUE),
    GMSC      = sum(GMSC,  na.rm = TRUE),
    LAST_DATE = max(as.Date(DATE), na.rm = TRUE),
    .groups = "drop"
  ) %>%
  left_join(bio_data, by = c("PLAYER" = "NAME_KEY")) %>%
  mutate(
    PLAYER = tools::toTitleCase(tolower(PLAYER)),
    SLUG   = gsub("[^a-z0-9-]", "", gsub(" ", "-", gsub(", ", "-", tolower(PLAYER))))
  ) %>%
  arrange(PLAYER, SEASON, LAST_DATE)
write_csv(player_seasons_playoffs, file.path(REPO_ROOT, "players", "player_seasons_playoffs.csv"))
inform(" * DONE")

inform("Writing player awards CSV....")
bind_rows(
  get_all_player_awards(),
  get_champions(dfs_playoffs) %>%
    distinct(PLAYER, SEASON) %>%
    mutate(AWARD = "Champion")
) %>%
  mutate(
    PLAYER = tools::toTitleCase(tolower(PLAYER)),
    SLUG   = gsub("[^a-z0-9-]", "", gsub(" ", "-", gsub(", ", "-", tolower(PLAYER))))
  ) %>%
  select(SLUG, PLAYER, SEASON, AWARD) %>%
  write_csv(file.path(REPO_ROOT, "players", "player_awards.csv"))
inform(" * DONE")

inform("Writing career stat totals CSVs....")
career_totals <- dfs %>%
  group_by(PLAYER) %>%
  summarize(
    P     = sum(P,     na.rm = TRUE),
    R     = sum(R,     na.rm = TRUE),
    A     = sum(A,     na.rm = TRUE),
    S     = sum(S,     na.rm = TRUE),
    B     = sum(B,     na.rm = TRUE),
    `3PM` = sum(`3PM`, na.rm = TRUE),
    .groups = "drop"
  )

list(
  "totals-p"   = "P",
  "totals-r"   = "R",
  "totals-a"   = "A",
  "totals-s"   = "S",
  "totals-b"   = "B",
  "totals-3pm" = "3PM"
) %>%
  iwalk(function(col, name) {
    career_totals %>%
      arrange(desc(.data[[col]])) %>%
      slice_head(n = 250) %>%
      mutate(RANK = row_number()) %>%
      select(RANK, PLAYER, all_of(col)) %>%
      write_csv(file.path(REPO_ROOT, "data", glue("{name}.csv")))
  })
inform(" * DONE")

inform("Writing game high CSVs....")
game_highs_base <- dfs_all %>%
  select(DATE, SEASON, PLAYER, TEAM, OPP, gametype, ROUND, GAME, P, R, A, S, B, `3PM`)

list(
  "game-highs-p"   = "P",
  "game-highs-r"   = "R",
  "game-highs-a"   = "A",
  "game-highs-s"   = "S",
  "game-highs-b"   = "B",
  "game-highs-3pm" = "3PM"
) %>%
  iwalk(function(col, name) {
    game_highs_base %>%
      arrange(desc(.data[[col]]), DATE) %>%
      slice_head(n = 50) %>%
      mutate(RANK = row_number()) %>%
      select(RANK, DATE, SEASON, PLAYER, TEAM, OPP, gametype, ROUND, GAME, P, R, A, S, B, `3PM`) %>%
      write_csv(file.path(REPO_ROOT, "data", glue("{name}.csv")))
  })
inform(" * DONE")

inform("Writing playoff classics CSV....")
dfs_playoffs %>%
  filter(WL == "W") %>%
  group_by(PLAYER, SEASON, DATE, TEAM, OPP, ROUND, GAME) %>%
  summarize(
    P     = sum(P,     na.rm = TRUE),
    R     = sum(R,     na.rm = TRUE),
    A     = sum(A,     na.rm = TRUE),
    S     = sum(S,     na.rm = TRUE),
    B     = sum(B,     na.rm = TRUE),
    `3PM` = sum(`3PM`, na.rm = TRUE),
    FGM   = sum(FGM,   na.rm = TRUE),
    FGA   = sum(FGA,   na.rm = TRUE),
    GMSC  = sum(GMSC,  na.rm = TRUE),
    .groups = "drop"
  ) %>%
  arrange(desc(GMSC)) %>%
  slice_head(n = 10) %>%
  mutate(
    RANK   = row_number(),
    PLAYER = tools::toTitleCase(tolower(PLAYER)),
    OPP    = str_replace(OPP, "@", "")
  ) %>%
  select(RANK, SEASON, DATE, PLAYER, TEAM, OPP, ROUND, GAME, P, R, A, S, B, `3PM`, FGM, FGA, GMSC) %>%
  write_csv(file.path(REPO_ROOT, "nbntv-classics", "playoff-classics.csv"))
inform(" * DONE")

inform("Writing hof.csv....")
hof_csv <- dfs_all %>%
  mutate(
    G = 1,
    GMSC_WGT_WL = case_when(WL == "W" ~ 1.25, TRUE ~ 0.75),
    GMSC_WGT_GAMETYPE = case_when(
      ROUND == 1 ~ 2, ROUND == 2 ~ 4, ROUND == 3 ~ 8, ROUND == 4 ~ 16, TRUE ~ 1
    )
  ) %>%
  group_by(SEASON, TEAM, ROUND) %>%
  mutate(GMSC_WGT_ROUNDLEN = case_when(
    GMSC_WGT_GAMETYPE == 1 ~ 1, TRUE ~ 5.5 / n_distinct(DATE)
  )) %>%
  ungroup() %>%
  mutate(GMSC_WEIGHTED = GMSC * GMSC_WGT_WL * GMSC_WGT_GAMETYPE * GMSC_WGT_ROUNDLEN) %>%
  group_by(PLAYER) %>%
  summarize_at(vars(c("G", "M", "P", "R", "A", "S", "B", "GMSC_WEIGHTED")), sum) %>%

  left_join(
    get_champions(dfs_playoffs) %>%
      group_by(PLAYER) %>% summarize(RINGS = n_distinct(SEASON), .groups = "drop"),
    by = "PLAYER"
  ) %>%
  left_join(
    dfs_playoffs %>%
      group_by(PLAYER) %>% summarize(PLAYOFF_APPS = n_distinct(SEASON), .groups = "drop"),
    by = "PLAYER"
  ) %>%
  left_join(
    dfs %>%
      distinct(PLAYER, SEASON) %>%
      mutate(ACTIVE = as.integer(SEASON == max(SEASON))) %>%
      group_by(PLAYER) %>% summarize(ACTIVE = max(ACTIVE), .groups = "drop"),
    by = "PLAYER"
  ) %>%
  left_join(
    dfs %>%
      distinct(PLAYER, TEAM) %>%
      group_by(PLAYER) %>%
      summarize(TEAMS = str_c(sort(TEAM), collapse = ","), .groups = "drop"),
    by = "PLAYER"
  ) %>%
  left_join(get_allnbn1() %>% group_by(PLAYER) %>% summarize(ALL_NBN_1 = n(), .groups = "drop"), by = "PLAYER") %>%
  left_join(get_allnbn2() %>% group_by(PLAYER) %>% summarize(ALL_NBN_2 = n(), .groups = "drop"), by = "PLAYER") %>%
  left_join(get_allnbn3() %>% group_by(PLAYER) %>% summarize(ALL_NBN_3 = n(), .groups = "drop"), by = "PLAYER") %>%
  left_join(get_allstars() %>% group_by(PLAYER) %>% summarize(ALLSTARS  = n(), .groups = "drop"), by = "PLAYER") %>%
  left_join(get_mvp()      %>% group_by(PLAYER) %>% summarize(MVP       = n(), .groups = "drop"), by = "PLAYER") %>%
  left_join(get_dpoy()     %>% group_by(PLAYER) %>% summarize(DPOY      = n(), .groups = "drop"), by = "PLAYER") %>%
  left_join(get_alldef()   %>% group_by(PLAYER) %>% summarize(ALL_DEF   = n(), .groups = "drop"), by = "PLAYER") %>%
  left_join(get_6moy()     %>% group_by(PLAYER) %>% summarize(SIX_MOY   = n(), .groups = "drop"), by = "PLAYER") %>%
  left_join(get_roy()      %>% group_by(PLAYER) %>% summarize(ROY       = n(), .groups = "drop"), by = "PLAYER") %>%
  left_join(get_mip()      %>% group_by(PLAYER) %>% summarize(MIP       = n(), .groups = "drop"), by = "PLAYER") %>%
  mutate(
    RINGS        = replace_na(RINGS, 0L),
    PLAYOFF_APPS = replace_na(PLAYOFF_APPS, 0L),
    ALLSTARS     = replace_na(ALLSTARS, 0L),
    ALL_NBN_1    = replace_na(ALL_NBN_1, 0L),
    ALL_NBN_2    = replace_na(ALL_NBN_2, 0L),
    ALL_NBN_3    = replace_na(ALL_NBN_3, 0L),
    MVP          = replace_na(MVP, 0L),
    DPOY         = replace_na(DPOY, 0L),
    ALL_DEF      = replace_na(ALL_DEF, 0L),
    SIX_MOY      = replace_na(SIX_MOY, 0L),
    ROY          = replace_na(ROY, 0L),
    MIP          = replace_na(MIP, 0L),
    HOF_POINTS   = round(
      GMSC_WEIGHTED / 100 +
        RINGS        * 10 +
        PLAYOFF_APPS *  1 +
        MVP          *  8 +
        DPOY         *  5 +
        ALLSTARS     *  3 +
        ALL_NBN_1    *  4 +
        ALL_NBN_2    *  3 +
        ALL_NBN_3    *  2 +
        ALL_DEF      *  2 +
        SIX_MOY      *  3 +
        ROY          *  3 +
        MIP          *  2,
      1
    )
  ) %>%
  arrange(desc(HOF_POINTS)) %>%
  slice_head(n = 250) %>%
  select(PLAYER, TEAMS, HOF_POINTS, RINGS, PLAYOFF_APPS, ALLSTARS,
         ALL_NBN_1, ALL_NBN_2, ALL_NBN_3, MVP, DPOY, ALL_DEF,
         SIX_MOY, ROY, MIP,
         G, M, P, R, A, S, B, ACTIVE)

write_csv(hof_csv, file.path(REPO_ROOT, "data", "hof.csv"))
inform(" * DONE")

inform(glue(" * DONE [{round(Sys.time() - start_time, 1)}s]"))
