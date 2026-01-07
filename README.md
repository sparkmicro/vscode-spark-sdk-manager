
# SPARK SDK for VS Code

[Officially supported](https://www.sparkmicro.com/sdk-docs/) extension for the **SPARK Microsystems SDK**.

This extension integrates the SPARK SDK toolchain into VS Code, leveraging [pixi](https://prefix.dev/) to manage reproducible development environments for SPARK Wireless Core and Audio Core applications.

## Features

*   **Automated Toolchain Management**: Automatically detects `pixi.toml` in your SPARK SDK projects and installs all necessary dependencies (compilers, debuggers, tools).
*   **One-Click Activation**: Activates the development environment within VS Code, ensuring your terminal has access to the correct version of all tools.
*   **Offline Support**: Generate and load offline environment bundles for development in restricted networks.

## Getting Started

1.  Open a SPARK SDK project folder in VS Code.
2.  The extension will detect the project and prompt you to create/activate the environment.

## Documentation

For detailed instructions on using the SPARK SDK, please visit the official documentation:
[https://www.sparkmicro.com/sdk-docs/](https://www.sparkmicro.com/sdk-docs/)

## Commands

*   `SPARK: Create SPARK Environment`: Initialize the toolchain for the current workspace.
*   `SPARK: Activate Environment`: Activate the environment in the current VS Code window.
*   `SPARK: Deactivate Environment`: Deactivate and return to the system global environment.
*   `SPARK: Generate Activation Scripts`: Create shell scripts (`activate.sh`, `activate.bat`) for external terminal usage.

## License

This extension is licensed under the MIT License.
