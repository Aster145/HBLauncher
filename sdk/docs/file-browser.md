# Read-only file browser

The local `apps/file-browser` app adds directory listing and small file previews
to HBLauncher. Its `/` is a virtual root containing the same title-owned mounts
as the existing FTP adapter:

| Path | Content |
| --- | --- |
| `/save` | SmileBASIC's save filesystem |
| `/tmp` | SmileBASIC's temporary filesystem |
| `/rom` | SmileBASIC's mounted read-only application resources |

This does not grant NAND, SD card, system-root or other titles' filesystem
access. The browser has no create, upload, rename or delete operation. Its
native adapter is the existing `sdk/host/ftp-native.cjs`; selecting the virtual
root alone does not initialize the native storage adapter.

## Host integration

Only app ID `file-browser` with this SDK manifest may submit the custom view
request:

```json
"sdk": { "version": 1, "capabilities": ["files-read"] }
```

The mailbox operation is `5`. Request argument `a` is the action (`1` list,
`2` automatic text/hex preview, `3` hex preview), `b` is the zero-based page,
and `c` is the UTF-8 path length. Path bytes start at mailbox byte 32 and are
limited to 740 bytes. Listing pages hold 12 entries; preview pages read at
most 512 bytes. `apps/file-browser/protocol.json` defines the shared layout.

The SDK handles these requests at an existing worker-stop boundary. It lazily
creates the file browser backend, validates its result, uploads both the view
metadata and text atlas, and only then acknowledges the sequence. A duplicate
sequence does not repeat the operation. An app ownership change clears both
mailboxes and resets backend transient state; it retains the adapter to avoid
repeated native allocations. Other SDK operations keep their existing paths.

All offsets below are byte offsets from the application's 8 MiB binding-zero
buffer, not offsets into `c.atlas`:

| Region | Start | Size |
| --- | ---: | ---: |
| View metadata | `0x280000` | `0x4000` (16 KiB) |
| Text atlas, L8 2048 x 1024 | `0x300000` | `0x200000` (2 MiB) |

The runtime validates the complete result before the first view upload. No
browser upload may reach outside these regions, including the app's control
state or SDK mailbox. The response payload is at most 1024 bytes and contains
the metadata prefix. Normal path, listing, preview or rasterization failures
are presented in the backend's metadata status/error fields. Backend exceptions
or invalid upload results instead become an SDK `native` error (`3`), or SDK
`timeout` (`4`) for `ETIMEDOUT`.

## Loading the host change

Building the app and refreshing the menu is sufficient for later shader/asset
changes. This initial installation also changes `sdk/host/runtime.cjs`, which
an already-running Node process has cached. Restart the launcher host in a
fresh supported console session before opening this app for the first time;
refreshing the current menu cannot activate the new host operation. The saved
SmileBASIC `NS2` bootstrap does not need to be re-entered.

## Offline checks

```sh
node --test sdk/tests/sdk.test.cjs sdk/tests/browser-runtime.test.cjs
```

These tests use fake hardware and RPC memory. They check capability isolation,
owner resets, upload bounds and acknowledgement ordering; they do not claim
that a console filesystem was read.
