# google-maps-cli (`gmaps`)

A command-line tool for accessing Google Maps data via the
[Google Places API](https://developers.google.com/maps/documentation/places/web-service/overview).

## Architecture

The CLI is built on [commander](https://github.com/tj/commander.js) with a
small command-registry pattern so new commands are cheap to add:

```
src/
  index.ts            # bin entry (shebang) -> builds program, parses argv
  program.ts          # commander program (name/version/description/help)
  commands/
    index.ts          # COMMANDS registry; registerAll(program)
    init.ts           # `gmaps init` (store API key)
  lib/
    config.ts         # ~/.google-maps-cli paths
    credentials.ts    # credential schema + load/save/clear (0600)
    logger.ts         # colored output helpers
```

Adding a command is two steps: create `src/commands/<name>.ts` exporting a
`register(program)` function, then add it to the `COMMANDS` array in
`src/commands/index.ts`.

## Setup

```sh
npm install
npm run build

# expose the `gmaps` command on your PATH
npm link
```

### Dev loop (no global install)

Run the TypeScript source directly with `tsx`, no rebuild needed:

```sh
npm run dev -- init
```

## Authentication

The Google Places API authenticates with an **API key**. Create one in the
[Google Cloud Console](https://console.cloud.google.com/google/maps-apis/credentials)
(enable the "Places API (New)" for your project), then store it:

```sh
gmaps init                 # prompts for the API key (input hidden)
gmaps init --api-key KEY   # non-interactive
```

The key is stored in `~/.google-maps-cli/credentials.json` with `0600`
permissions. Credentials are modeled as a tagged union (`type: "api_key"`),
so an OAuth / service-account flow can be added later without breaking the
stored file format.
