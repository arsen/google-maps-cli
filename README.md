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
    place-id.ts       # `gmaps place-id` (resolve place_id from a URL)
    place-details.ts  # `gmaps place-details` (full details for a place_id)
    download-place-photos.ts  # `gmaps download-place-photos` (save photos)
    dump.ts           # `gmaps dump` (URL -> ABOUT.md + photos/ folder)
  lib/
    config.ts         # ~/.google-maps-cli paths
    credentials.ts    # credential schema + load/save/clear (0600)
    maps-url.ts       # parse/expand Google Maps place URLs
    places.ts         # Google Places API (New) client
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

## Commands

### `gmaps init`

Store a Google Places API key (see [Authentication](#authentication)).

### `gmaps place-id [url]`

Resolve the canonical Google `place_id` for a Google Maps place URL. The URL
can be passed as an argument or pasted when prompted; shortened
`maps.app.goo.gl` links are expanded automatically. Outputs only the bare
`place_id` so it can be piped into other commands:

```sh
gmaps place-id "https://maps.app.goo.gl/abc123"
# -> ChIJN1t_tDeuEmsRUsoyG83frY4

gmaps place-details "$(gmaps place-id "https://maps.app.goo.gl/abc123")"
```

### `gmaps place-details [place-id]`

Fetch as much information as the Places API exposes for a place — including up
to five reviews. The `place_id` can be passed as an argument or entered when
prompted.

```sh
gmaps place-details ChIJN1t_tDeuEmsRUsoyG83frY4
gmaps place-details ChIJN1t_tDeuEmsRUsoyG83frY4 --json
```

#### Output format (default)

Without flags, the command prints a human-readable report to stdout. Diagnostic
messages (if any) go to stderr, so the report stays pipeable. Sections are
omitted when the underlying data is unavailable:

```
Blue Bottle Coffee
Coffee shop

place_id: ChIJN1t_tDeuEmsRUsoyG83frY4
Address: 300 Webster St, Oakland, CA 94607, USA
Phone: +1 510-653-3394
Website: https://bluebottlecoffee.com
Google Maps: https://maps.google.com/?cid=...
Status: Operational
Price level: $$
Rating: 4.5 / 5 (1,234 reviews)
Coordinates: 37.8071, -122.2750
Types: cafe, coffee_shop, food, point_of_interest, establishment

Summary
A coffee bar serving house-roasted beans and pastries.

Opening hours
  Monday: 7:00 AM – 6:00 PM
  Tuesday: 7:00 AM – 6:00 PM
  ...

Photos (10)
  1. 4032x3024 by Jane Doe
  2. 3024x4032 by John Smith
  ...
  Run "gmaps download-place-photos" to save these.

Reviews (5)

  5/5 Jane Doe · 2 weeks ago
  Great espresso and friendly staff.

  4/5 John Smith · a month ago
  Cozy spot, can get crowded on weekends.
```

#### Output format (`--json`)

With `--json`, the command prints the full, unmodified Places API (New)
response as pretty-printed JSON. This includes every field requested in the
field mask (and may contain fields beyond those shown below). The top-level
shape is:

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | The canonical `place_id`. |
| `displayName` | `{ text, languageCode }` | Localized place name. |
| `formattedAddress` | string | Full formatted address. |
| `shortFormattedAddress` | string | Abbreviated address. |
| `addressComponents` | array | Structured address parts. |
| `location` | `{ latitude, longitude }` | Place coordinates. |
| `viewport` | object | Recommended map viewport. |
| `plusCode` | object | Open Location Code. |
| `types` / `primaryType` | string[] / string | Place category tags. |
| `primaryTypeDisplayName` | `{ text, languageCode }` | Localized primary type. |
| `nationalPhoneNumber` / `internationalPhoneNumber` | string | Phone numbers. |
| `websiteUri` / `googleMapsUri` / `googleMapsLinks` | string / object | Links. |
| `businessStatus` | string | e.g. `OPERATIONAL`. |
| `rating` | number | Average rating (1–5). |
| `userRatingCount` | number | Number of ratings. |
| `priceLevel` / `priceRange` | string / object | Price information. |
| `editorialSummary` | `{ text, languageCode }` | Google's summary. |
| `regularOpeningHours` / `currentOpeningHours` | object | Hours, incl. `weekdayDescriptions[]`. |
| `utcOffsetMinutes` | number | UTC offset. |
| `photos` | array | Photo references (see below). |
| `reviews` | array | Up to 5 reviews (see below). |
| `paymentOptions` / `parkingOptions` / `accessibilityOptions` | object | Amenity details. |
| `fuelOptions` / `evChargeOptions` | object | For gas / EV stations. |
| `takeout`, `delivery`, `dineIn`, `reservable`, `servesBreakfast`, … | boolean | Service attributes. |

Each entry in `reviews` has the shape:

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Review resource name. |
| `rating` | number | Star rating (1–5). |
| `text` | `{ text, languageCode }` | Review text (translated to your locale). |
| `originalText` | `{ text, languageCode }` | Original-language review text. |
| `authorAttribution` | `{ displayName, uri, photoUri }` | Reviewer info. |
| `relativePublishTimeDescription` | string | e.g. `"2 weeks ago"`. |
| `publishTime` | string | RFC 3339 timestamp. |
| `googleMapsUri` | string | Link to the review on Google Maps. |

> Note: the Places API caps `reviews` at five per place; there is no way to
> retrieve all reviews through the official API.

Each entry in `photos` has the shape:

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Photo resource name, e.g. `places/<id>/photos/<ref>`. Used to fetch the image. |
| `widthPx` / `heightPx` | number | Original photo dimensions. |
| `authorAttributions` | array of `{ displayName, uri, photoUri }` | Photographer info. |
| `googleMapsUri` | string | Link to the photo on Google Maps. |

> The `photos` array contains *references*, not image URLs. To turn a reference
> into an actual image you make a second Place Photo request — see
> [`download-place-photos`](#gmaps-download-place-photos-place-id) below. The
> API returns up to ~10 photos per place.

### `gmaps download-place-photos [place-id]`

Download a place's photos to a local directory. The command fetches the place
details to discover the photo references, then downloads each image via the
Place Photo endpoint. The `place_id` can be passed as an argument or entered
when prompted.

```sh
gmaps download-place-photos ChIJN1t_tDeuEmsRUsoyG83frY4
gmaps download-place-photos ChIJN1t_tDeuEmsRUsoyG83frY4 -o ./photos --max-width 1200 -n 3
```

Options:

| Flag | Description |
| --- | --- |
| `-o, --output <dir>` | Directory to save photos to (created if missing). Default: `.` |
| `--max-width <px>` | Max width in pixels (1–4800). |
| `--max-height <px>` | Max height in pixels (1–4800). |
| `-n, --limit <count>` | Maximum number of photos to download. |

If neither `--max-width` nor `--max-height` is given, photos default to a max
width of 1600px. Files are named `<place-name-slug>-NN.<ext>` (extension
derived from the response content type). Each saved file path is printed to
stdout so the output can be piped; progress and a final summary go to stderr.

### `gmaps dump [url]`

One-shot export of everything known about a place into a folder, designed to be
fed to an AI agent. Given a Google Maps URL, it resolves the `place_id`, fetches
the full place details, and writes:

- `ABOUT.md` — a Markdown summary of the place (name, type, overview, contact,
  rating, opening hours, up to five reviews, and a gallery linking the photos).
- `photos/` — the place's photos downloaded as image files, referenced from
  `ABOUT.md`.

The URL can be passed as an argument or pasted when prompted; shortened
`maps.app.goo.gl` links are expanded automatically.

```sh
gmaps dump "https://maps.app.goo.gl/abc123" -o ./blue-bottle
gmaps dump "https://maps.app.goo.gl/abc123" -o ./blue-bottle --max-width 1200 -n 5
```

Options:

| Flag | Description |
| --- | --- |
| `-o, --output <dir>` | Directory to write the dump into (created if missing). Default: `.` |
| `--max-width <px>` | Max photo width in pixels (1–4800). |
| `--max-height <px>` | Max photo height in pixels (1–4800). |
| `-n, --limit <count>` | Maximum number of photos to download. |

Resulting layout:

```
<output>/
  ABOUT.md
  photos/
    <place-name-slug>-01.jpg
    <place-name-slug>-02.jpg
    ...
```
