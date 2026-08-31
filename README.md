# Hermes UI Feedback

Annotate any web page, batch spatial comments, and hand one bounded implementation task to Hermes. The target project needs no integration and the tool has no runtime dependencies.

## Use it

1. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository's `extension/` directory.
2. In a terminal, enter the development worktree Hermes should edit and run:

   ```sh
   node /absolute/path/to/hermes-ui-feedback/server.mjs
   ```

3. Open the page you want to review and click the **Hermes UI Feedback** extension icon.
4. Click elements, write notes, review the batch, then choose **Send to Hermes**.

The bridge binds only to `127.0.0.1:43127` and accepts browser requests only from this extension's fixed ID. It accepts one job at a time, invokes `hermes` without a shell, attaches a clean screenshot of the visible page, and tells Hermes to edit and verify locally without committing, pushing, deploying, merging, or messaging externally.

Use `--cwd /path/to/worktree`, `--port 43127`, or `--hermes /path/to/hermes` when the defaults do not fit. If the port changes, update `BRIDGE` and `host_permissions` in the extension.

Notes survive reloads for the life of the browser session. Full browser navigation may require clicking the extension icon again.
