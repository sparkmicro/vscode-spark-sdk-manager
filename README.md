# SPARK SDK for VS Code

[Officially supported](https://www.sparkmicro.com/sdk-docs/) extension for the **SPARK Microsystems SDK**.

This extension integrates the SPARK SDK toolchain into VS Code, leveraging [pixi](https://prefix.dev/) to manage reproducible development environments for SPARK Wireless Core and Audio Core applications.

⚠️ **WARNING**: This extension requires **SPARK SDK 2.3 or above**. Earlier versions are not supported.

## Features

*   **Automatic Bootstrapping**: Automatically downloads and installs the internal toolchain manager (Pixi) if it's not present, making onboarding new developers effortless.
*   **Full Window Context**: Injects environment variables (like `PATH`, `CONDA_PREFIX`, and custom variables) into the **entire VS Code window context**. This means terminals, other extensions, and tasks all inherit the activated environment automatically.
*   **Task Support**: Integrate SPARK tasks natively into VS Code. Run tasks via the Status Bar, Command Palette, or standard VS Code "Run Task" menu.
*   **Config Watcher**: Automatically detects changes in `pixi.toml` and `pixi.lock` (including external Git operations) and prompts to keep the environment in sync.
*   **Offline Support**: Unique capability to generate and load "offline" environment packs (`.tar.gz` + `.pixi`), enabling reproducible development in air-gapped or restricted networks.

## Getting Started

1.  Open a SPARK SDK project folder in VS Code.
2.  The extension will detect the project and prompt you to create/activate the environment.

## Documentation

For detailed instructions on using the SPARK SDK, please visit the official documentation:
[https://www.sparkmicro.com/sdk-docs/](https://www.sparkmicro.com/sdk-docs/)

## Commands (Command Palette: `SPARK: ...`)

*   **Create Environment**: Initialize a new SPARK toolchain environment.
*   **Activate Environment**: Manually activate a specific environment.
*   **Run Task**: Run a task defined in `pixi.toml` (also available via `$(play) SPARK Tasks` in Status Bar).
*   **Deactivate Environment**: Deactivate the current environment.
*   **Clear Environment**: Clear the environment cache/state (`.pixi` folder).
*   **Generate Offline Environment**: Create a portable archive of your current environment.
*   **Load Offline Environment**: Restore an environment from an offline archive.
*   **Generate Activation Scripts**: Create shell scripts (`activate.sh`, `activate.bat`) for external use.

## Configuration

*   `spark-sdk.defaultEnvironment`: Name of the environment to activate automatically on startup.
*   `spark-sdk.environment`: Fallback environment name to use if no specific environment is selected (default: `default`).
*   `spark-sdk.showDefaultEnvironment`: If `true`, the `default` environment is included in the environment selection list (default: `false`).
*   `spark-sdk.checkUpdates`: Automatically check for updates on startup (default: `true`).
*   `spark-sdk.useSystemPixi`: If `true`, use the system `pixi` executable instead of the self-contained one (default: `false`).
*   `spark-sdk.disableConfigChangePrompt`: If `true`, suppresses prompts when the environment (lockfile) is out of sync (default: `false`).
*   `spark-sdk.offlineEnvironmentName`: Name of the directory when unpacking an offline environment (default: `env`).
*   `spark-sdk.autoReload`: Automatically reload the window after activation to ensure all extensions pick up changes.

## ⚖️ Legal & Attribution

**Third-Party Software**:
This extension downloads and uses the **Pixi** executable to manage environments.
Pixi is Copyright (c) prefix.dev GmbH and is licensed under the BSD 3-Clause License.
See `THIRD_PARTY_NOTICES.md` in the extension installation directory for full license text.

