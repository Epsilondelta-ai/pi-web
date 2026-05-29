# Source layout

`src` is organized by runtime boundary first, then by domain.

```text
src/
├── App.astro          # Astro shell; composition only
├── app-shell/         # shell-only Astro fragments
├── pages/             # route entry points
├── pi-app/            # `<pi-app>` custom element feature domains
├── shared/            # cross-feature frontend modules
├── design-system/     # design tokens
├── styles/            # global CSS and global partials
└── i18n/              # UI copy and locale helpers
```

Rules:
- Put feature-specific code in `src/pi-app/<feature>/`.
- Put cross-feature code in `src/shared/<domain>/`; avoid catch-all `utils` folders.
- Keep tests beside the file or feature they verify.
- Keep route and shell files thin: compose domains, do not own feature logic.
