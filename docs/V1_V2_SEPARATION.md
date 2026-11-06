# TDQSYS product separation - 7 November 2026

## Product boundaries

| Item | v1 | v2 |
|---|---|---|
| Source branch | legacy-v1, based on 90d0ee7 | release/v2 |
| Working folder | ../TDQSYS v1 | ../TDQSYS v2 |
| Installer identity | com.tdqsys.queue | com.tdqsys.queue.v2 |
| Product / data folder | TDQSYS / %APPDATA%\TDQSYS | TDQSYS v2 / %APPDATA%\TDQSYS v2 |
| App executable | TDQSYS.exe | tdqsys-v2.exe |
| Speech executable | tts_server.exe | tdqsys-v2-speech.exe |
| Engine / speech ports | 8081 / 8001 | 8082 / 8002 |
| Site / update feed | tdqsys.pages.dev/version.json | tdqsys-v2.pages.dev/version.json |
| Published update | 1.1.28, unchanged | Disabled bootstrap manifest, 2.0.0 |

The active canonical tdqsys repository is retained for the current workspace,
private test outputs and built artifacts. The two named source folders are Git
worktrees of the same repository, not duplicated Git repositories. They have
separate branches. Binary prerequisites and node_modules are not tracked or
automatically copied into a new worktree; builds currently run in the canonical
workspace. Do not delete the canonical repository while linked worktrees exist.
No installed program/data folder has been renamed, moved or automatically copied.

V1 retains its checkpoint identity and code. A later printing-only update must
reuse the label/printer components without introducing the v2 registration,
cloud print-job, Sheets or giveaway workflows. That update is not implemented here.

## V2 installation and test data

Manual bootstrap installer:
app/dist-test-drive-v2-bootstrap/tdqsys-v2-setup-2.0.0.exe (232,693,291 bytes).
Portable: tdqsys-v2-portable-2.0.0.exe (232,412,571 bytes).

V2 starts with its own profile and installation identity. Existing pre-separation
test data remains in the old TDQSYS profile and shared backend; it is NOT silently
cloned into v2. A fresh v2 instance needs its own licence and event configuration.
Do not copy data.json/writer tokens between two simultaneously operating apps.
An intentional migration of existing v2 test history requires a separate scoped
plan, preserving the old profile and avoiding two writers for the same instance.

The restore helper retains destination identity, cloud URL and speech port.
OTA feed selection is compiled into product.js, not restored/configurable.
V2 finds only the uninstaller alongside its own executable. Shutdown targets its
own child PIDs, never arbitrary port owners. The update helper waits for its own
parent PID, not generic v1 process names.

## Shared backend hardening

Migration 202611070001_private_rpc_permissions was applied. All 38 TDQSYS RPC
overloads deny EXECUTE to PUBLIC, anon and authenticated; service_role retains
access. Existing hosted explicit grants were removed as well as unsafe future
function defaults for the migration role. The public queue_state viewer contract
was not changed. No event records were reset/deleted and Sheets was not changed.

Security threat addressed: a browser with the public project key could bypass
the writer-authenticated bridge and call privileged SECURITY DEFINER operations.
The fix closes that path; a regression test sets hosted defaults BEFORE all
migrations, checks every overload and verifies an anonymous reset is denied.
This is a focused authorization correction, not a new full-system security rating.

## Deployment and OTA safeguards

Do not deploy current v2 code to the legacy Pages project. New project tdqsys-v2
uses its own production branch release/v2 and encrypted bindings. Existing
backend/code-encryption keys were provisioned in memory, never printed or saved.
The existing tdqsys project and GitHub stable release assets were not modified.
Source is pushed to release/v2, not to remote main, to avoid triggering legacy
Git-integrated deployments. Push legacy-v1 only for deliberate v1 maintenance.

Prepare v2 with node tools/prepare-v2-pages.cjs. This creates .v2-pages with
its own functions/shared/public tree and standard wrangler.toml; root v1
public/version.json stays unchanged. Run the normal tests before deployment,
clear the generated deployment's .wrangler cache, and deploy only tdqsys-v2.
Cloudflare Pages rejects custom Wrangler configuration filenames at deployment;
wrangler.v2.toml is the source template, not a --config deploy argument.

V2 manifest currently has enabled:false: no installer URL is advertised. A later
OTA test requires a separate 2.0.1 build uploaded as
tdqsys-v2-setup-2.0.1.exe under the matching GitHub tag, exact size and SHA-256,
productId com.tdqsys.queue.v2, channel v2, and enabled:true in the V2 feed only.
Wrong product/channel/version/host/path/size/checksum is rejected. The helper
checks installer exit and installed product/version before relaunching.
Installers remain unsigned; signing and physical Windows acceptance are pending.
Existing cache-clear-on-quit behavior remains: check speech warm-up after restart.

## Verified / remaining acceptance

338 Node checks passed, 3 optional skips; 36 PostgreSQL checks and 16 speech tests
passed. Licensing release gate passed. Live both-site config endpoints and
invalid-contact rejection verified with zero new registrations. V1 manifest still
1.1.28; v2 manifest 2.0.0 and disabled. Packaged native/product/engine/restore files
match source, and the v2 speech payload has its unique name.

No actual installation, uninstall, OTA application, printer output, display
capture or physical listening acceptance was performed. Next: manually install
the v2 bootstrap, configure/license its new instance, verify coexistence/data
boundaries, then authorize the v2-only 2.0.1 OTA rehearsal. Do not declare OTA
accepted from mocked updater validation or build success alone.
