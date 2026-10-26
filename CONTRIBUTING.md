# Contributing to nbn-today

Thanks for helping. This is the site at [nbn.today](https://nbn.today).

## How a change gets in

1. Branch off `main`.
2. Make your change.
3. Before asking for review, rebase on the latest `main`.
4. Push your branch and open a pull request into `main`.

`main` is what's live, so changes only reach it through a reviewed pull
request. You don't need to deploy anything. Once it's approved and merged,
the owner ships it.

If your change also needs an API change
([nbn-api](https://github.com/bshk93/nbn-api)), open a pull request there
too and link the two, so they can ship together.

## One-time setup

Turn on the repo's commit hook:

```bash
git config core.hooksPath build/hooks
```

It checks your commit before it lands, and it bumps the version and changelog
for you. Don't bypass it (`--no-verify`). If it fails, fix what it reports.

## The changelog

If your change is something a visitor can see, add an entry to the **top** of
`changelog.json`:

```json
{ "version": "pending", "date": "YYYY-MM-DD", "changes": ["What changed, in one plain sentence"] },
```

Leave `"pending"` as it is. The hook replaces it with the real version number.
Changes nobody can see (docs, comments, tooling) don't get an entry.

`changelog.json` is long. Edit only the top few lines and never re-save the
whole file, or every entry gets reformatted.

## How the site is built

- There's no build step and no framework. Each page is a folder with an
  `index.html`, and shared code lives in a few files at the root
  (`nav.js`, `contract.js` and so on).
- **This repo has no league data.** The pages fetch it from `/api` and from
  CSV files the server builds. A page opened from a local file server will
  load with no data.
- Team pages are all `stats/teams/team.js`. Never edit `stats/teams/{ABB}/index.html`.
- Use the shared styles in `css/components.css` and `css/theme.css` rather
  than styling a page from scratch. `docs/design-system.md` explains them.
- Tabs and anything else that feels like "going somewhere" go into browser
  history, so Back returns to them. Filters and sorting don't
  (`docs/design-system.md`, "Back button").

## Secrets

Never commit tokens, webhook URLs or API keys. This repo is public. A secret
that gets pushed has to be revoked, even if it's deleted straight away.

## Finding your way around

- `CLAUDE.md` is the map: where each feature lives and what not to break. If
  you use Claude Code, it reads this file automatically.
- `docs/` has the detail for each feature.
- `BACKLOG.md` lists open work, if you're looking for something to pick up.
- The league's rules are in `about/rulebook/index.html`
  ([nbn.today/about/rulebook](https://nbn.today/about/rulebook)).
