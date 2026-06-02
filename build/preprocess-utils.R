get_win_streaks <- function(dfs) {
  
  dfs %>% 
    distinct(TEAM, SEASON, DATE, WL) %>% 
    group_by(TEAM, SEASON) %>% 
    arrange(TEAM, SEASON, DATE) %>% 
    mutate(flag = WL != coalesce(lag(WL), "X")) %>% 
    mutate(streak_group = cumsum(flag)) %>% 
    group_by(TEAM, SEASON, WL, streak_group) %>% 
    summarize(
      min_dt = min(DATE),
      max_dt = max(DATE),
      streak = n()
    )
  
}

# News ----
get_newsfeed <- function(dfs, gmsc_thresh = 35) {
  
  feed_gmsc <- dfs %>% 
    filter(GMSC >= gmsc_thresh | TD == 1) %>% 
    
    mutate(HEADLINE = str_c(
      PLAYER, " <img src='logo-", tolower(TEAM), ".png' height='20'></img>",
      ' recorded ', P, ' points, ', 
      A, ' assists, ', R, ' rebounds, ', S, ' steals, and ',
      B, ' blocks on ', FGM, '-', FGA, ' shooting in a ',
      TEAM_PTS, '-', OPP_TEAM_PTS, 
      case_when(WL == 'W' ~ ' win over ', TRUE ~ ' loss to '),
      OPP, '.'
    )) %>% 
    select(SEASON, PLAYER, DATE, HEADLINE)
  
  records <- dfs %>% 
    arrange(DATE) %>% 
    mutate(
      RECORD_P = cummax(P),
      RECORD_R = cummax(R),
      RECORD_A = cummax(A),
      RECORD_S = cummax(S),
      RECORD_B = cummax(B)
    )
  
  
  feed_records <- map_dfr(
    c('P', 'R', 'A', 'S', 'B'),
    function(var) {
      record_var = str_c('RECORD_', var)
      
      records %>% 
        filter(get(var) >= lag(get(record_var))) %>% 
        mutate(HEADLINE = str_c(
          PLAYER, " <img src='logo-", tolower(TEAM), ".png' height='20'></img>",
          ' recorded an NBN record ', get(var), ' ', var, ' in a ',
          TEAM_PTS, '-', OPP_TEAM_PTS, 
          case_when(WL == 'W' ~ ' win over ', TRUE ~ ' loss to '),
          OPP, '.'
        )) %>% 
        select(SEASON, PLAYER, DATE, HEADLINE)
    }
  )
  
  highs <- dfs %>% 
    arrange(DATE) %>% 
    group_by(PLAYER) %>% 
    mutate(
      RECORD_P = cummax(P),
      RECORD_R = cummax(R),
      RECORD_A = cummax(A),
      RECORD_S = cummax(S),
      RECORD_B = cummax(B)
    )
  
  feed_highs <- map_dfr(
    c('P', 'R', 'A', 'S', 'B'),
    function(var) {
      record_var = str_c('RECORD_', var)
      
      x <- highs %>% 
        filter(get(var) >= lag(get(record_var))) %>% 
        mutate(HEADLINE = str_c(
          PLAYER, " <img src='logo-", tolower(TEAM), ".png' height='20'></img>",
          ' recorded a career high of ', get(var), ' ', var, ' in a ',
          TEAM_PTS, '-', OPP_TEAM_PTS, 
          case_when(WL == 'W' ~ ' win over ', TRUE ~ ' loss to '),
          OPP, '.'
        ))
      
      if (var == 'P') {
        x <- filter(x, get(var) >= 30)
      } else if (var %in% c('A', 'R')) {
        x <- filter(x, get(var) >= 15)
      } else {
        x <- filter(x, get(var) >= 6)
      }
      
      x %>% 
        select(SEASON, PLAYER, DATE, HEADLINE)
    }
  )
  
  career_totals <- dfs %>% 
    group_by(PLAYER) %>% 
    arrange(PLAYER, DATE) %>% 
    mutate(
      CAREER_P = cumsum(P),
      CAREER_R = cumsum(R),
      CAREER_A = cumsum(A),
      CAREER_S = cumsum(S),
      CAREER_B = cumsum(B),
      CAREER_3PM = cumsum(`3PM`)
    )
  
  feed_milestones_career <- map_dfr(
    c('P', 'R', 'A', 'S', 'B', '3PM'),
    function(var) {
      career_var <- str_c('CAREER_', var)
      
      x <- career_totals %>% 
        filter(floor(get(career_var) / 1000) > coalesce(floor(lag(get(career_var))/ 1000), 0)) %>% 
        filter(get(career_var) >= 1000) %>% 
        mutate(HEADLINE = str_c(
          PLAYER, " <img src='logo-", tolower(TEAM), ".png' height='20'></img>",
          ' reached a milestone of ', get(career_var), ' career ', var, '.'
        ))
      
      x %>% 
        select(SEASON, PLAYER, DATE, HEADLINE)
    }
  )
  
  
  bind_rows(
    feed_gmsc, 
    feed_records, 
    feed_highs,
    feed_milestones_career
  ) %>% 
    arrange(desc(DATE))
  
}

# Achievements ----
get_achievements_season <- function(player_df, dfs, playername, ach_metadata) {
  # Carry Job
  ach_carry_job <- dfs %>% 
    inner_join(
      player_df %>% 
        distinct(SEASON, DATE, TEAM),
      by = c("SEASON", "DATE", "TEAM")
    ) %>% 
    group_by(SEASON, DATE, TEAM) %>% 
    summarize(TEAM_PTS = sum(P),
              PLAYER_PTS = sum(case_when(PLAYER == playername ~ P, TRUE ~ 0)),
              .groups = "drop") %>% 
    group_by(SEASON) %>% 
    summarize(TEAM_PTS = sum(TEAM_PTS), 
              PLAYER_PTS = sum(PLAYER_PTS),
              .groups = "drop") %>% 
    mutate(ACHIEVEMENT = "Carry Job") %>% 
    mutate(PCT = PLAYER_PTS / TEAM_PTS) %>% 
    filter(PCT >= .3) %>% 
    select(ACHIEVEMENT, SEASON)
  
  # The Waiter
  ach_waiter <- dfs %>% 
    inner_join(
      player_df %>% 
        distinct(SEASON, DATE, TEAM),
      by = c("SEASON", "DATE", "TEAM")
    ) %>% 
    group_by(SEASON, DATE, TEAM) %>% 
    summarize(TEAM_A = sum(A),
              PLAYER_A = sum(case_when(PLAYER == playername ~ A, TRUE ~ 0)),
              .groups = "drop") %>% 
    group_by(SEASON) %>% 
    summarize(TEAM_A = sum(TEAM_A), 
              PLAYER_A = sum(PLAYER_A),
              .groups = "drop") %>% 
    mutate(PCT = PLAYER_A / TEAM_A) %>% 
    filter(PCT >= .3) %>% 
    mutate(ACHIEVEMENT = "The Waiter") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # I'm Him
  ach_im_him <- dfs %>% 
    group_by(SEASON, PLAYER) %>% 
    summarize(P = sum(P),
              .groups = "drop") %>% 
    group_by(SEASON) %>% 
    filter(P == max(P)) %>% 
    filter(PLAYER == playername) %>% 
    mutate(ACHIEVEMENT = "I'm Him") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Jake from State Farm
  ach_jake <- dfs %>% 
    group_by(SEASON, PLAYER) %>% 
    summarize(A = sum(A), .groups = "drop") %>% 
    group_by(SEASON) %>% 
    filter(A == max(A)) %>% 
    filter(PLAYER == playername) %>% 
    mutate(ACHIEVEMENT = "Jake from State Farm") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Director of Boards
  ach_dob <- dfs %>% 
    group_by(SEASON, PLAYER) %>% 
    summarize(R = sum(R), .groups = "drop") %>% 
    group_by(SEASON) %>% 
    filter(R == max(R)) %>% 
    filter(PLAYER == playername) %>% 
    mutate(ACHIEVEMENT = "Director of Boards") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Steal Yo Girl
  ach_steal_yo_girl <- dfs %>% 
    group_by(SEASON, PLAYER) %>% 
    summarize(S = sum(S), .groups = "drop") %>% 
    group_by(SEASON) %>% 
    filter(S == max(S)) %>% 
    filter(PLAYER == playername) %>% 
    mutate(ACHIEVEMENT = "Mr. Steal Yo Girl") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Turn Down the Sliders
  ach_sliders <- dfs %>% 
    group_by(SEASON, PLAYER) %>% 
    summarize(B = sum(B), .groups = "drop") %>% 
    group_by(SEASON) %>% 
    filter(B == max(B)) %>% 
    filter(PLAYER == playername) %>% 
    mutate(ACHIEVEMENT = "Turn Down the Sliders") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Splash Brother
  ach_splash <- dfs %>% 
    group_by(SEASON, PLAYER) %>% 
    summarize(`3PM` = sum(`3PM`), .groups = "drop") %>% 
    group_by(SEASON) %>% 
    filter(`3PM` == max(`3PM`)) %>% 
    filter(PLAYER == playername) %>% 
    mutate(ACHIEVEMENT = "Splash Brother") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Enforcer
  ach_enforcer <- dfs %>% 
    group_by(SEASON, PLAYER) %>% 
    summarize(PF = sum(PF), .groups = "drop") %>% 
    group_by(SEASON) %>% 
    filter(PF == max(PF)) %>% 
    filter(PLAYER == playername) %>% 
    mutate(ACHIEVEMENT = "Enforcer") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Tank Commander
  ach_tank <- dfs %>% 
    filter(PLAYER == playername) %>% 
    group_by(SEASON) %>% 
    summarize(W = sum(case_when(WL == "W" ~ 1, TRUE ~ 0)),
              .groups = "drop") %>% 
    left_join(
      dfs %>% 
        group_by(SEASON) %>% 
        summarize(
          M = sum(case_when(PLAYER == playername ~ M, TRUE ~ 0)),
          G = sum(case_when(PLAYER == playername ~ 1, TRUE ~ 0)),
          MPG = M/G,
          .groups = "drop"
        ),
      by = "SEASON"
    ) %>% 
    filter(MPG >= 25, W <= 0.25*G, G >= 50) %>% 
    mutate(ACHIEVEMENT = "Tank Commander") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Hot Potato
  ach_hot_potato <- player_df %>% 
    group_by(SEASON) %>% 
    summarize(TEAMS = n_distinct(TEAM),
              .groups = "drop") %>% 
    filter(TEAMS > 2) %>% 
    mutate(ACHIEVEMENT = "Hot Potato") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Singler Line
  ach_singler <- player_df %>% 
    group_by(SEASON) %>% 
    summarize(
      FG = sum(FGM)/sum(FGA),
      `3P` = sum(`3PM`)/sum(`3PA`),
      FT = sum(FTM)/sum(FTA),
      .groups = "drop"
    ) %>% 
    filter(FG + `3P` + FT < 1) %>% 
    mutate(ACHIEVEMENT = "The Singler Line") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # 50/40/90 Club
  ach_504090 <- player_df %>% 
    group_by(SEASON) %>% 
    summarize(
      FG = sum(FGM)/sum(FGA),
      `3P` = sum(`3PM`)/sum(`3PA`),
      FT = sum(FTM)/sum(FTA),
      .groups = "drop"
    ) %>% 
    filter(FG >= .5, `3P` >= .4, FT >= .9) %>% 
    mutate(ACHIEVEMENT = "50/40/90 Club") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # 2K Club
  ach_2k <- player_df %>% 
    group_by(SEASON) %>% 
    summarize(P = sum(P), .groups = "drop") %>% 
    filter(P >= 2000) %>% 
    mutate(ACHIEVEMENT = "2K Club") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Sharing is Caring
  ach_sharing <- player_df %>% 
    group_by(SEASON) %>% 
    summarize(A = sum(A), .groups = "drop") %>% 
    filter(A >= 700) %>% 
    mutate(ACHIEVEMENT = "Sharing is Caring") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # GETDAFUCKOUTTAHEREIGOTIT
  ach_getdaf <- player_df %>% 
    group_by(SEASON) %>% 
    summarize(R = sum(R), .groups = "drop") %>% 
    filter(R >= 1000) %>% 
    mutate(ACHIEVEMENT = "GETDAFUCKOUTTAHEREIGOTIT") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Grand Theft Auto
  ach_gta <- player_df %>% 
    group_by(SEASON) %>% 
    summarize(S = sum(S), .groups = "drop") %>% 
    filter(S >= 150) %>% 
    mutate(ACHIEVEMENT = "Grand Theft Auto") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Send It Back
  ach_senditback <- player_df %>% 
    group_by(SEASON) %>% 
    summarize(B = sum(B), .groups = "drop") %>% 
    filter(B >= 1000) %>% 
    mutate(ACHIEVEMENT = "Send It Back") %>% 
    select(ACHIEVEMENT, SEASON)
  
  # Free Throw Merchant
  ach_freethrowmerchant <- player_df %>% 
    group_by(SEASON) %>% 
    summarize(P = sum(P), P_FT = sum(FTM),
              .groups = "drop") %>% 
    mutate(PCT = P_FT/P) %>% 
    filter(P >= 500, PCT >= 0.25) %>% 
    mutate(ACHIEVEMENT = "Free Throw Merchant") %>% 
    select(ACHIEVEMENT, SEASON)
  
  ach_metadata %>% 
    inner_join(
      bind_rows(
        ach_carry_job,
        ach_waiter,
        ach_im_him,
        ach_jake,
        ach_dob,
        ach_steal_yo_girl,
        ach_sliders,
        ach_splash,
        ach_enforcer,
        ach_tank,
        ach_hot_potato,
        ach_singler,
        ach_504090,
        ach_2k,
        ach_sharing,
        ach_getdaf,
        ach_gta,
        ach_senditback,
        ach_freethrowmerchant
      ),
      by = "ACHIEVEMENT"
    ) 
}


get_achievements_game <- function(combined_df, ach_metadata) {
  # The Snell Award
  ach_snell <- combined_df %>% 
    filter(M >= 28, P + A + R + B + S == 0) %>% 
    mutate(ACHIEVEMENT = "The Snell Award") %>% 
    select(ACHIEVEMENT, DATE)
  
  # Stinker
  ach_stinker <- combined_df %>% 
    filter(GMSC <= -10) %>% 
    mutate(ACHIEVEMENT = "Stinker") %>% 
    select(ACHIEVEMENT, DATE)
  
  # One Man Show
  ach_oneman <- combined_df %>% 
    filter(GMSC >= 50) %>% 
    mutate(ACHIEVEMENT = "One Man Show") %>% 
    select(ACHIEVEMENT, DATE)
  
  # Specialist
  ach_specialist <- combined_df %>% 
    filter(P >= 21, FTM == 0, FGM == `3PM`) %>%  
    mutate(ACHIEVEMENT = "Specialist") %>% 
    select(ACHIEVEMENT, DATE)
  
  # Well-Rounded
  ach_wellrounded <- combined_df %>% 
    filter(P >= 5, R >= 5, A >= 5, S >= 5, B >= 5) %>%  
    mutate(ACHIEVEMENT = "Well-Rounded") %>% 
    select(ACHIEVEMENT, DATE)
  
  # Various point thresholds
  ach_pts_all <- combined_df %>% 
    filter(P >= 70) %>% 
    mutate(ACHIEVEMENT = case_when(
      P >= 100 ~ "Son of Wilt",
      P >= 81 ~ "Mamba Mentality",
      TRUE ~ "Empty Calories"
    )) %>% 
    select(ACHIEVEMENT, DATE)
  
  ach_metadata %>% 
    inner_join(
      bind_rows(
        ach_snell,
        ach_stinker,
        ach_oneman,
        ach_specialist,
        ach_wellrounded,
        #ach_triplesingle,
        ach_pts_all
      ),
      by = "ACHIEVEMENT"
    ) %>% 
    group_by(TYPE, ACHIEVEMENT, DESCRIPTION) %>% 
    summarize(DATES = str_c(DATE, collapse = ", "), .groups = "drop")
}

calculate_team_offense_defense <- function(dfs) {
  
  x <- dfs %>% 
    #filter(SEASON == input$pr_season) %>% 
    mutate(OPP_RAW = str_replace(OPP, "@", "")) %>%
    group_by(SEASON, TEAM, OPP, OPP_RAW, DATE) %>% 
    summarize(P = sum(P)) %>% 
    ungroup()
  
  y <- x %>% 
    group_by(TEAM, SEASON) %>% 
    arrange(TEAM, SEASON, DATE) %>% 
    mutate(CUM_PPG = cumsum(P)/row_number()) %>% 
    ungroup()
  
  z <- y %>%
    inner_join(
      y %>% select(OPP_RAW = TEAM, DATE, OPP_P = P, OPP_CUM_PPG = CUM_PPG),
      by = c('OPP_RAW', 'DATE')
    ) %>%
    
    group_by(SEASON, TEAM) %>% 
    arrange(SEASON, TEAM, DATE) %>% 
    mutate(CUM_ALLOWED = cumsum(OPP_P)/row_number()) %>% 
    ungroup()
  
  z2 <- z %>% 
    inner_join(
      z %>% select(OPP_RAW = TEAM, DATE, OPP_CUM_ALLOWED = CUM_ALLOWED),
      by = c('OPP_RAW', 'DATE')
    ) %>% 
    
    mutate(
      DIFF_OFF = P - OPP_CUM_ALLOWED,
      DIFF_DEF = OPP_CUM_PPG - OPP_P
    )
  
  z2 %>%
    group_by(TEAM, SEASON) %>%
    summarize(
      OFF_RTG = mean(DIFF_OFF),
      DEF_RTG = mean(DIFF_DEF),
      TOT_RTG = OFF_RTG + DEF_RTG
    )

}

ROSTER_SHEET_ID <- "14Pwrjk4S9cgB1f2Q16S3YgfoHre8gUxjjXde8k5Nn_0"

# Classify a Google Sheets background RGB triplet into a contract type string.
# Returns NA_character_ for white/unset cells, decorative red headers, or unknowns.
classify_bg_color <- function(r, g, b) {
  if (is.null(r) || is.null(g) || is.null(b)) return(NA_character_)
  r <- as.numeric(r); g <- as.numeric(g); b <- as.numeric(b)
  if (is.na(r) || is.na(g) || is.na(b)) return(NA_character_)
  if (r > 0.95 && g > 0.95 && b > 0.95) return(NA_character_)  # white = no fill
  refs <- list(
    UFA        = c(1.00, 0.85, 0.40),
    RFA        = c(0.96, 0.70, 0.42),
    PLAYER_OPT = c(0.58, 0.77, 0.49),
    TEAM_OPT   = c(0.44, 0.66, 0.86),
    NON_GTD    = c(0.72, 0.72, 0.72)
  )
  dists <- map_dbl(refs, ~ sum((c(r, g, b) - .x)^2))
  if (min(dists) > 0.10) return(NA_character_)
  names(which.min(dists))
}

# Fetch cell background colors for salary columns (F:K) for one team sheet via
# the Sheets API v4.  Returns a named list: player_name -> chr vector of length 6
# (one per salary column), each element a classify_bg_color() result or NA.
get_cap_hold_flags <- function(spreadsheet_id, sheet_name, api_key) {
  url <- paste0(
    "https://sheets.googleapis.com/v4/spreadsheets/", spreadsheet_id,
    "?ranges=", sheet_name, "!A1:K100",
    "&fields=sheets.data.rowData.values(formattedValue,userEnteredFormat.backgroundColor)",
    "&key=", api_key
  )
  resp <- tryCatch(httr::GET(url), error = function(e) NULL)
  if (is.null(resp) || httr::status_code(resp) != 200) {
    if (!is.null(resp))
      warn(glue("Sheets API {httr::status_code(resp)} for {sheet_name}"))
    return(NULL)
  }
  parsed   <- httr::content(resp, as = "parsed", type = "application/json")
  row_data <- tryCatch(parsed$sheets[[1]]$data[[1]]$rowData, error = function(e) NULL)
  if (is.null(row_data)) return(NULL)

  result <- list()
  for (rw in row_data) {
    vals <- rw$values
    if (is.null(vals) || length(vals) < 6) next
    nm <- tryCatch(vals[[1]]$formattedValue, error = function(e) NULL)
    if (is.null(nm) || trimws(nm) == "") next
    colors <- map_chr(6:11, function(ci) {
      if (ci > length(vals)) return(NA_character_)
      bg <- tryCatch(vals[[ci]]$userEnteredFormat$backgroundColor, error = function(e) NULL)
      if (is.null(bg)) return(NA_character_)
      classify_bg_color(bg$red, bg$green, bg$blue)
    })
    if (any(!is.na(colors))) result[[trimws(nm)]] <- colors
  }
  result
}

write_roster_picks <- function(season, teams, output_dir) {
  yr_end    <- as.integer(str_extract(season, "\\d{2}$"))
  yr_labels <- map_chr(0:5, ~ sprintf("%02d-%02d", (yr_end - 1 + .x) %% 100, (yr_end + .x) %% 100))
  api_key   <- Sys.getenv("SHEETS_API_KEY", unset = "")

  for (team in teams) {
    url <- glue(
      "https://docs.google.com/spreadsheets/d/{ROSTER_SHEET_ID}",
      "/gviz/tq?tqx=out:csv&sheet={team}"
    )

    raw <- tryCatch(
      read_csv(url, col_names = FALSE, show_col_types = FALSE, name_repair = "minimal"),
      error = function(e) { warn(glue("Roster fetch failed for {team}: {e$message}")); NULL }
    )
    if (is.null(raw)) next

    while (ncol(raw) < 11) raw[[paste0("pad", ncol(raw) + 1)]] <- NA_character_

    cap_hold_map <- if (nchar(api_key) > 0)
      get_cap_hold_flags(ROSTER_SHEET_ID, team, api_key)
    else
      list()

    col1 <- function(i) { v <- as.character(raw[[1]][i]); if (is.na(v)) "" else v }

    # ── ROSTER ──────────────────────────────────────────────────────────────
    roster_type <- NA_character_
    roster_rows <- list()

    for (i in seq_len(nrow(raw))) {
      v <- col1(i)
      if (v == "Salary Cap Breakdown Totals") break
      if (v == "Two-Way Contracts") { roster_type <- "two-way"; next }
      if (v == "Dead Cap Figures")  { roster_type <- "dead";    next }
      v3 <- { x <- as.character(raw[[3]][i]); if (is.na(x)) "" else x }
      if (v == "Players" || (is.na(roster_type) && v3 == "Position")) {
        roster_type <- "player"
        next
      }
      if (is.na(roster_type) || v == "" || v3 == "Position") next

      salaries <- map_chr(6:11, ~ {
        val <- as.character(raw[[.x]][i])
        if (is.na(val)) "" else val
      })

      cap_holds_str <- {
        clrs <- cap_hold_map[[v]]
        if (!is.null(clrs)) {
          pairs <- map2_chr(yr_labels, clrs, function(yr, col) {
            if (is.na(col)) NA_character_ else paste0(yr, ":", col)
          })
          paste(na.omit(pairs), collapse = ",")
        } else ""
      }

      roster_rows[[length(roster_rows) + 1]] <- tibble(
        PLAYER    = v,
        POS       = { p <- as.character(raw[[3]][i]); if (is.na(p)) "" else p },
        AGE       = { a <- as.character(raw[[4]][i]); if (is.na(a)) "" else a },
        OVR       = { o <- as.character(raw[[5]][i]); if (is.na(o)) "" else o },
        TYPE      = roster_type,
        CAP_HOLDS = cap_holds_str,
        !!!setNames(as.list(salaries), yr_labels)
      )
    }

    write_csv(bind_rows(roster_rows), file.path(output_dir, glue("{tolower(team)}-roster.csv")))

    # ── PICKS ────────────────────────────────────────────────────────────────
    picks_start <- which(map_chr(seq_len(nrow(raw)), col1) == "Draft Picks")

    if (length(picks_start) == 0) {
      write_csv(
        tibble(YEAR = character(), ROUND = character(), TEAM = character(), TYPE = character()),
        file.path(output_dir, glue("{tolower(team)}-picks.csv"))
      )
      next
    }

    picks_rows  <- list()
    picks_type  <- NA_character_
    current_yr  <- NA_character_

    for (i in (picks_start[1] + 1):nrow(raw)) {
      v    <- col1(i)
      rnd  <- { r <- as.character(raw[[2]][i]); if (is.na(r)) "" else r }
      othr <- { o <- as.character(raw[[4]][i]); if (is.na(o)) "" else o }

      if (v == "Original Draft Picks") { picks_type <- "own";      next }
      if (v == "Acquired Draft Picks") { picks_type <- "acquired";  next }
      if (v == "Year" || is.na(picks_type)) next
      if (rnd == "") next

      if (v != "") current_yr <- v

      picks_rows[[length(picks_rows) + 1]] <- tibble(
        YEAR  = if (is.na(current_yr)) "" else current_yr,
        ROUND = rnd,
        TEAM  = if (othr == "") "Own" else othr,
        TYPE  = picks_type
      )
    }

    write_csv(bind_rows(picks_rows), file.path(output_dir, glue("{tolower(team)}-picks.csv")))
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
      mutate(
        W = coalesce(W, 0L), L = coalesce(L, 0L),
        RECORD = paste0(W, "-", L)
      ) %>%
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
  teams <- sort(unique(dfs$TEAM))
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
    mutate(
      W = coalesce(W, 0L), L = coalesce(L, 0L),
      RECORD = paste0(W, "-", L)
    ) %>%
    select(owner, OPP_CLEAN, RECORD) %>%
    pivot_wider(names_from = OPP_CLEAN, values_from = RECORD, values_fill = "") %>%
    arrange(owner) %>%
    rename(OWNER = owner) %>%
    select(OWNER, all_of(teams)) %>%
    write_csv(file.path(output_dir, "h2h-owners.csv"))
}