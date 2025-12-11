import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PixiManager } from './pixi';

export class EnvironmentManager {
    private _pixiManager: PixiManager;
    private _context: vscode.ExtensionContext;
    private _exec: (command: string, options?: any) => Promise<{ stdout: string, stderr: string }>;
    private _outputChannel: vscode.OutputChannel | undefined;
    private static readonly envStateKey = 'pixiSelectedEnvironment';

    constructor(pixiManager: PixiManager, context: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel, exec?: (command: string, options?: any) => Promise<{ stdout: string, stderr: string }>) {
        this._pixiManager = pixiManager;
        this._context = context;
        this._outputChannel = outputChannel;
        if (exec) {
            this._exec = exec;
        } else {
            const cp = require('child_process');
            this._exec = require('util').promisify(cp.exec);
        }
    }

    private log(message: string) {
        if (this._outputChannel) {
            this._outputChannel.appendLine(message);
        }
    }


    public getWorkspaceFolderURI(): vscode.Uri | undefined {
        return vscode.workspace.workspaceFolders?.[0]?.uri;
    }

    public async createEnvironment() {
        if (!this.getWorkspaceFolderURI()) {
            vscode.window.showErrorMessage('No workspace open.');
            return;
        }

        try {
            const installed = await this._pixiManager.isPixiInstalled();
            if (!installed) {
                // Auto-download without prompt
                await this._pixiManager.installPixi();
            }

            // Check if pixi.toml exists
            const workspacePath = this.getWorkspaceFolderURI()!.fsPath;
            const tomlPath = path.join(workspacePath, 'pixi.toml');

            if (fs.existsSync(tomlPath)) {
                vscode.window.showInformationMessage("pixi.toml already exists. Running install...");
                const pixi = this._pixiManager.getPixiPath();
                const term = vscode.window.createTerminal("Pixi Install", process.env.SHELL, []);
                term.show();
                term.sendText(`"${pixi}" install`);
            } else {
                await this._pixiManager.initProject();
                vscode.window.showInformationMessage("Pixi project initialized.");
            }

            // Auto-activate after creation/install
            await this.activate();

            // Generate helper scripts
            await this.generateActivationScripts(this.getWorkspaceFolderURI()!);


        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to create environment: ${error.message}`);
        }
    }


    private async getEnvironments(): Promise<string[]> {
        const pixiPath = this._pixiManager.getPixiPath();
        const workspaceUri = this.getWorkspaceFolderURI();
        if (!pixiPath || !workspaceUri) { return []; }

        try {
            const cmd = `"${pixiPath}" info --json`;
            const { stdout } = await this._exec(cmd, {
                cwd: workspaceUri.fsPath
            });
            const info = JSON.parse(stdout); // Need a type?
            if (info.environments_info && Array.isArray(info.environments_info)) {
                return info.environments_info
                    .map((e: any) => e.name)
                    .filter((n: string) => n !== 'default');
            }
            return [];
        } catch (e) {
            console.error("Failed to get environments info", e);
            return [];
        }
    }

    public async autoActivate() {
        const savedEnv = this._context.workspaceState.get<string>(EnvironmentManager.envStateKey);
        if (savedEnv) {
            console.log(`Auto-activating saved environment: ${savedEnv}`);
            const installed = await this._pixiManager.isPixiInstalled();
            if (installed) {
                await this.doActivate(savedEnv, true);
            }
        }
    }

    public async activate(silent: boolean = false) {
        const installed = await this._pixiManager.isPixiInstalled();
        if (!installed) {
            if (!silent) {
                vscode.window.showErrorMessage("Pixi not installed.");
            }
            return;
        }

        const envs = await this.getEnvironments();
        let selectedEnv = '';

        if (envs.length > 1) {
            if (!silent) {
                const pick = await vscode.window.showQuickPick(envs, {
                    placeHolder: 'Select Pixi Environment to Activate'
                });
                if (!pick) { return; }
                selectedEnv = pick;
            } else {
                // If silent and multiple environments, and 'default' is not filtered out
                // (which it now is in getEnvironments), then pick the first available.
                // The original logic here was to pick 'default' if present, otherwise the first.
                // With 'default' filtered out, this simplifies.
                selectedEnv = envs[0];
            }
        } else if (envs.length === 1) {
            selectedEnv = envs[0];
        } else if (envs.length === 0) {
            // If no environments are found (e.g., only 'default' existed and was filtered out)
            // We might want to handle this case, perhaps by falling back to 'default' if it's the only one.
            // However, the current instruction is to filter it out.
            // For now, if no non-default envs, we can't activate anything specific.
            // The `doActivate` will then be called with an empty string, which defaults to 'default'.
            // This implicitly means if only 'default' exists, it will be activated.
            // Let's keep `selectedEnv` as empty string if no non-default envs are found.
        }


        if (selectedEnv) {
            await this._context.workspaceState.update(EnvironmentManager.envStateKey, selectedEnv);
        }

        await this.doActivate(selectedEnv, silent);
    }

    private async doActivate(envName: string, silent: boolean) {

        const workspaceUri = this.getWorkspaceFolderURI();
        if (!workspaceUri) { return; }

        const pixiPath = this._pixiManager.getPixiPath();


        // Step 1: Run 'pixi install' visibly if not silent
        if (!silent) {
            try {
                await this.runInstallInTerminal(pixiPath!, workspaceUri, envName);
            } catch (e: any) {
                vscode.window.showErrorMessage(`Pixi install failed: ${e.message}`);
                return; // Stop activation if install fails
            }
        }

        try {
            const cmd = `"${pixiPath}" shell-hook --shell bash${envName ? ` -e ${envName}` : ''}`;

            this.log(`Activating environment: ${envName || 'default'} with command: ${cmd}`);

            // Show progress (less confusing title now)
            const location = silent ? vscode.ProgressLocation.Window : vscode.ProgressLocation.Notification;
            const title = "Activating Pixi Environment (syncing)...";

            const { stdout } = await vscode.window.withProgress({
                location,
                title,
                cancellable: false
            }, async () => {
                return await this._exec(cmd, {
                    cwd: workspaceUri.fsPath
                });
            });

            this.log(`Command output:\n${stdout}`);

            // Parse exports
            const lines = stdout.split('\n');
            const envUpdates = new Map<string, string>();

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('export ')) {
                    const firstEquals = trimmed.indexOf('=');
                    if (firstEquals === -1) continue;

                    const key = trimmed.substring(7, firstEquals);
                    let value = trimmed.substring(firstEquals + 1);

                    // Unquote
                    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.substring(1, value.length - 1);
                    }

                    envUpdates.set(key, value);
                }
            }

            // Apply to VSCode environment (terminals)
            const collection = this._context.environmentVariableCollection;

            for (const [key, value] of envUpdates) {
                let finalValue = value;
                if (key === 'PATH' && pixiPath) {
                    // Ensure the local pixi binary is in the path
                    const pixiBinDir = path.dirname(pixiPath);
                    // Check if already in path (simple check)
                    if (!value.includes(pixiBinDir)) {
                        finalValue = `${pixiBinDir}${path.delimiter}${value}`;
                    }
                }

                this._context.environmentVariableCollection.replace(key, finalValue);
                process.env[key] = finalValue;
            }


            if (!silent) {
                vscode.window.showInformationMessage(`Pixi environment '${envName || 'default'}' activated.`);
                const selection = await vscode.window.showInformationMessage(
                    "Environment activated. Reload window to ensure all extensions pick up changes?",
                    "Reload", "Later"
                );
                if (selection === "Reload") {
                    vscode.commands.executeCommand("workbench.action.reloadWindow");
                }
            } else {
                console.log('Pixi environment activated silently.');
            }

        } catch (e: any) {
            if (!silent) {
                vscode.window.showErrorMessage(`Failed to activate environment: ${e.message}`);
            } else {
                console.error(`Failed to auto-activate environment: ${e.message}`);
            }
        }
    }

    private async runInstallInTerminal(pixiPath: string, workspaceUri: vscode.Uri, envName?: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const terminal = vscode.window.createTerminal({
                name: `Pixi Install${envName ? ` (${envName})` : ''}`,
                cwd: workspaceUri.fsPath,
                env: process.env // Inherit env
            });

            terminal.show();

            const platform = process.platform;
            let cmd = `"${pixiPath}" install --color always${envName ? ` -e ${envName}` : ''}`;

            // Append exit command so terminal closes automatically on success
            if (platform === 'win32') {
                // Powershell or cmd? VS Code defaults depend on user settings.
                // Safest to just assume user shell logic or try generic chaining.
                // actually, vscode terminals don't auto-close unless the shell process exits.
                // But we don't know the shell. 
                // However, we CAN listen for the process exit if we send the exit command.

                // Let's rely on standard shell delimiters.
                cmd += ` ; exit`;
            } else {
                cmd += ` ; exit $?`;
            }

            terminal.sendText(cmd);

            const disposable = vscode.window.onDidCloseTerminal((t) => {
                if (t === terminal) {
                    disposable.dispose();
                    if (t.exitStatus && t.exitStatus.code === 0) {
                        resolve();
                    } else {
                        // If code is undefined, it might have been closed by user manually
                        const code = t.exitStatus ? t.exitStatus.code : 'unknown';
                        reject(new Error(`Pixi install terminal closed with code ${code}`));
                    }
                }
            });
        });
    }

    public async deactivate(silent: boolean = false) {
        // Clear saved state
        await this._context.workspaceState.update(EnvironmentManager.envStateKey, undefined);

        // Clear environment variables
        this._context.environmentVariableCollection.clear();

        if (!silent) {
            // Prompt for reload
            const selection = await vscode.window.showInformationMessage(
                "Environment deactivated. Reload window to apply changes?",
                "Reload", "Later"
            );
            if (selection === "Reload") {
                vscode.commands.executeCommand("workbench.action.reloadWindow");
            }
        }
    }

    public async generateActivationScripts(workspaceUri: vscode.Uri) {
        const platform = process.platform;

        // Generate activate.sh for bash/zsh (Linux/macOS)
        // We always generate the sh script as it might be useful even on Windows (WSL/Git Bash)
        const shPath = path.join(workspaceUri.fsPath, 'activate.sh');
        if (!fs.existsSync(shPath)) {
            const shContent = `#!/bin/sh
# Activation script generated by Pixi VS Code Extension

# Detect shell
if [ -n "$ZSH_VERSION" ]; then
    _PIXI_SHELL="zsh"
elif [ -n "$BASH_VERSION" ]; then
    _PIXI_SHELL="bash"
else
    _PIXI_SHELL="bash" # Default to bash
fi

if [ -n "$1" ]; then
    _TARGET_ENV="$1"
else
    # Auto-select logic
    _ENVS=$("$PWD/.pixi/bin/pixi" info | grep "Environment:" | awk '{print $2}' | grep -v "^default$")
    _COUNT=$(echo "$_ENVS" | grep -c .)
    
    if [ "$_COUNT" -eq "1" ]; then
        _TARGET_ENV="$_ENVS"
    elif [ -z "$_ENVS" ]; then
        # Only default exists
        _TARGET_ENV=""
    else
        echo "Usage: source activate.sh <environment_name>"
        echo "Available environments:"
        echo "$_ENVS"
        return 1 2>/dev/null || exit 1
    fi
fi

export PATH="$PWD/.pixi/bin:$PATH"
if [ -n "$_TARGET_ENV" ]; then
    eval "$(pixi shell-hook --shell $_PIXI_SHELL -e "$_TARGET_ENV")"
else
    eval "$(pixi shell-hook --shell $_PIXI_SHELL)"
fi
unset _PIXI_SHELL
unset _TARGET_ENV
unset _ENVS
unset _COUNT
`;
            try {
                await fs.promises.writeFile(shPath, shContent, { mode: 0o755 });
                this.log(`Created ${shPath}`);
            } catch (e) {
                console.error(`Failed to create activate.sh: ${e}`);
            }
        }

        // Generate activate.bat for Windows CMD
        // Also useful if user is on Windows
        const batPath = path.join(workspaceUri.fsPath, 'activate.bat');
        if (!fs.existsSync(batPath)) {
            const batContent = `@echo off
rem Activation script generated by Pixi VS Code Extension
if not "%~1"=="" (
    set "_TARGET_ENV=%~1"
    goto :activate
)

REM Auto-select logic
set _COUNT=0
set _LAST_ENV=

for /f "tokens=2" %%i in ('"%CD%\\.pixi\\bin\\pixi" info ^| findstr "Environment:"') do (
    if not "%%i"=="default" (
        set /a _COUNT+=1
        set "_LAST_ENV=%%i"
    )
)

if "%_COUNT%"=="1" (
    set "_TARGET_ENV=%_LAST_ENV%"
    goto :activate
)

if "%_COUNT%"=="0" (
    REM Only default exists
    set "_TARGET_ENV="
    goto :activate
)

echo Usage: activate.bat ^<environment_name^>
echo Available environments:
for /f "tokens=2" %%i in ('"%CD%\\.pixi\\bin\\pixi" info ^| findstr "Environment:"') do (
     if not "%%i"=="default" echo %%i
)
exit /b 1

:activate
set "PATH=%CD%\\.pixi\\bin;%PATH%"
if not "%_TARGET_ENV%"=="" (
    for /f "tokens=*" %%i in ('pixi shell-hook --shell cmd -e "%_TARGET_ENV%"') do %%i
) else (
    for /f "tokens=*" %%i in ('pixi shell-hook --shell cmd') do %%i
)
set _TARGET_ENV=
set _COUNT=
set _LAST_ENV=
`;
            try {
                await fs.promises.writeFile(batPath, batContent);
                this.log(`Created ${batPath}`);
            } catch (e) {
                console.error(`Failed to create activate.bat: ${e}`);
            }
        }
    }
}
