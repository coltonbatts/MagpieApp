# Releasing

## Release 0.2.0

Use this command from the repo root:

```bash
npm run release:0.2.0
```

What it does:
- Requires a clean git working tree.
- Sets version `0.2.0` in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- Refreshes `src-tauri/Cargo.lock` during desktop build and commits it.
- Runs `npm test`, `npm run build`, and `npm run desktop:build -- --bundles dmg`.
- Commits with message `Release v0.2.0`.
- Creates and pushes tag `v0.2.0`.
- Prints links to the Actions workflow and release page.

After push, GitHub Actions workflow `.github/workflows/release.yml` creates release `v0.2.0` and uploads macOS DMG asset(s).

## Future releases

For later versions, repeat the same flow:
1. Update `scripts/release-0.2.0.sh` version constants or copy it to a new release script.
2. Bump versions in:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
3. Commit and tag as `vX.Y.Z`.
4. Push branch and tag.
5. Confirm release assets under GitHub Releases.

## Artifacts

- GitHub Releases page: `<repo>/releases`
- Expected macOS artifact path in CI: `src-tauri/target/release/bundle/dmg/*.dmg`

## Signing and notarization

Current CI passes through Apple signing and notarization secrets only if they are set:
- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

If these are not configured, release still builds and uploads a DMG, but notarization is a follow-up task.
