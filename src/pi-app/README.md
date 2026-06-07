# `src/pi-app`

`src/pi-app` is the minimal `<pi-app>` host shell.

Core keeps only:

```text
src/pi-app/
├── index.ts          # custom element registration, plugin host bridge, settings event wiring
├── constants.ts      # shared constants still used by the host/settings surface
├── plugins/          # plugin loading, backend bridge, mount API, piWeb subject registry
└── settings/         # pi/auth/OAuth/settings modal helpers and schemas
```

Do not restore the former built-in feature folders here:

- `input/`
- `messages/`
- `sessions/`
- `status/`
- `transcript/`
- `workspace/`

Those surfaces are owned by default plugins:

- files/editor: `pi-web-file-browser`
- git view: `pi-web-git-viewer`
- workspace/session sidebar: `pi-web-sidebar`
- chat/composer/session execution: `pi-web-chat`

The host may expose compatibility bridge methods for plugins, such as `openWorkspacePath`, `deleteWorkspace`,
`newSession`, `deleteSession`, `renameSession`, and `deleteWorkspaceSessions`, but these methods must delegate to
backend registry APIs or dispatch plugin-consumable events instead of reintroducing built-in UI/session ownership.
