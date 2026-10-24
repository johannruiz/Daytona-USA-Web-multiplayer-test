# Contributions

**gareth10203** also contributed the macOS Logitech G29 WebHID report-size and
device-collection improvements integrated in release 53.8.24:

- [Pull request #3](https://github.com/johannruiz/Daytona-USA-Web-multiplayer-test/pull/3)
- Original commit: `48ca11d1e38fb2b40d92c210998dbd7224f1ab8d`, preserved in merge history.
- Supports the reported 16-byte G29 output descriptor while retaining native
  seven-byte commands. Physical G29/macOS confirmation remains pending.

The experimental WebHID force-feedback providers (HID PID, native T300,
Logitech G29 and T300 WebHID v2), HID diagnostics, direct drive-board force
helpers and wheel-detection improvements were contributed by **gareth10203**:

- [Pull request #2](https://github.com/johannruiz/Daytona-USA-Web-multiplayer-test/pull/2)
- Source commit: `77149347ec286154867896137f5eee15371a259b`

These contributions were adapted into the current runtime with explicit device
pairing, gameplay safety gates, serialized/cancellable tests and a revised UI.
The original project and third-party license notices remain in LICENSE,
NOTICE.md and THIRD_PARTY.md.
