# @manuelstolze/pi-hello-world

An example [Pi coding agent](https://github.com/earendil-works/pi) extension. It registers a `/hello [name]` slash command that shows a friendly notification, and exists as a template for building new extensions in this monorepo.

## Install

```bash
npm install @manuelstolze/pi-hello-world
```

Then add it to your Pi configuration (e.g. `package.json` `pi.extensions`, or `~/.config/pi/config.json`):

```json
{
  "pi": {
    "extensions": ["@manuelstolze/pi-hello-world"]
  }
}
```

## Usage

Inside a Pi session, run:

```
/hello Ada
```

## Development

From the repository root:

```bash
npm install
npm run build --workspace @manuelstolze/pi-hello-world
npm test
```
