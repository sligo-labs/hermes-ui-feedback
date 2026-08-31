# Hermes UI Feedback

Point at any configured web UI, leave spatial notes, and send one visible implementation request to its Hermes Discord project. The target application needs no integration and the extension has no runtime dependencies.

## Try it

1. Download and unzip the latest extension release.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the unzipped `extension/` directory.
3. Open a configured page and click **Hermes UI Feedback**.
4. Click elements, add notes, review the batch, and choose **Send to Hermes**.

If Sligo Access opens, sign in once, return to the page, and send again. The panel links to the resulting Discord thread.

## How it routes

The extension sends the visible screenshot plus bounded DOM context to `feedback.sligolabs.com`. The authenticated service maps the page hostname through `projects.json` and posts one human-readable message with `feedback.json` and `screenshot.png` through that project's existing Discord webhook identity. The message mentions Hermes V2, so normal Discord routing owns the session, worktree, progress, steering, and delivery.

- Production host: post in the project's parent channel and let Hermes create a thread.
- Preview host: search recent project threads for the exact preview origin and post there; fall back to a new thread when no match is found.
- Unknown host: reject it until an operator adds a project mapping.

The service strips input values, inline event handlers, `srcdoc`, and nonces from captured element HTML. Discord webhook URLs stay server-side and are never included in the extension or repository.

## Add a project

Add one entry to `projects.json` with production hostnames, optional preview-host regular expressions, and each route's Discord parent channel plus webhook environment variable. Restart the service after changing the file.

The server uses only Node.js built-ins and the installed read-only `hermes discord` CLI for preview-thread lookup.
