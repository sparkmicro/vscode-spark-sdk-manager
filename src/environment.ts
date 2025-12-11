import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PixiManager } from './pixi';

export class EnvironmentManager {
    private _pixiManager: PixiManager;
    private _context: vscode.ExtensionContext;
    private _exec: (command: string, options?: any) => Promise<{ stdout: string, stderr: string }>;
    private static readonly ENV_STATE_KEY = 'pixiSelectedEnvironment';

    constructor(pixiManager: PixiManager, context: vscode.ExtensionContext, exec?: (command: string, options?: any) => Promise<{ stdout: string, stderr: string }>) {
        this._pixiManager = pixiManager;
        this._context = context;
        if (exec) {
            this._exec = exec;
        } else {
            const cp = require('child_process');
            this._exec = require('util').promisify(cp.exec);
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

            // If exists, maybe we just want to install?
            // "Command: Create Pixi Environment (pixi init)" usually implies creating the TOML.
            // But if TOML exists, maybe we just ensure env is installed.

            if (fs.existsSync(tomlPath)) {
                vscode.window.showInformationMessage("pixi.toml already exists. Running install...");
                // Ensure env is installed
                // logic to run pixi install
                const pixi = this._pixiManager.getPixiPath();
                const cp = require('child_process');
                // We run this in a terminal or background?
                // Better in a terminal so user sees output?
                // Or execAsync for background.
                // Let's use terminal for visibility.
                const term = vscode.window.createTerminal("Pixi Install", process.env.SHELL, []);
                term.show();
                term.sendText(`"${pixi}" install`);
            } else {
                await this._pixiManager.initProject();
                vscode.window.showInformationMessage("Pixi project initialized.");
            }

            // Auto-activate after creation/install
            await this.activate();

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to create environment: ${error.message}`);
        }
    }


    private async getEnvironments(): Promise<string[]> {
        const pixiPath = this._pixiManager.getPixiPath();
        const workspaceUri = this.getWorkspaceFolderURI();
        if (!pixiPath || !workspaceUri) return [];

        try {
            const { stdout } = await this._exec(`"${pixiPath}" info --json`, {
                cwd: workspaceUri.fsPath
            });
            const info = JSON.parse(stdout); // Need a type?
            if (info.environments_info && Array.isArray(info.environments_info)) {
                return info.environments_info.map((e: any) => e.name);
            }
            return [];
        } catch (e) {
            console.error("Failed to get environments info", e);
            return [];
        }
    }

    public async autoActivate() {
        const savedEnv = this._context.workspaceState.get<string>(EnvironmentManager.ENV_STATE_KEY);
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
            if (!silent) vscode.window.showErrorMessage("Pixi not installed.");
            return;
        }

        const envs = await this.getEnvironments();
        let selectedEnv = '';

        if (envs.length > 1) {
            if (!silent) {
                const pick = await vscode.window.showQuickPick(envs, {
                    placeHolder: 'Select Pixi Environment to Activate'
                });
                if (!pick) return;
                selectedEnv = pick;
            } else {
                if (envs.includes('default')) selectedEnv = 'default';
                else selectedEnv = envs[0];
            }
        } else if (envs.length === 1) {
            selectedEnv = envs[0];
        }

        if (selectedEnv) {
            await this._context.workspaceState.update(EnvironmentManager.ENV_STATE_KEY, selectedEnv);
        }

        await this.doActivate(selectedEnv, silent);
    }

    private async doActivate(envName: string, silent: boolean) {

        const workspaceUri = this.getWorkspaceFolderURI();
        if (!workspaceUri) return;

        const pixiPath = this._pixiManager.getPixiPath();

        try {
            const cmd = `"${pixiPath}" shell-hook --shell bash${envName ? ` -e ${envName}` : ''}`;

            // Show progress
            const location = silent ? vscode.ProgressLocation.Window : vscode.ProgressLocation.Notification;
            const title = silent ? `Activating Pixi Environment: ${envName || 'default'}...` : "Activating Pixi Environment...";

            const { stdout } = await vscode.window.withProgress({
                location,
                title,
                cancellable: false
            }, async () => {
                return await this._exec(cmd, {
                    cwd: workspaceUri.fsPath
                });
            });

            // Parse exports
            // Output usually container 'export VAR=VALUE'
            // We need to handle quoted values.
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
            // Clear previous? Maybe not.

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


            // Persist the fact that we activated? 
            // VSCode persists EnvironmentVariableCollection automatically.

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
            if (!silent)
                vscode.window.showErrorMessage(`Failed to activate environment: ${e.message}`);
            else
                console.error(`Failed to auto-activate environment: ${e.message}`);
        }
    }
    public async deactivate(silent: boolean = false) {
        // Clear saved state
        await this._context.workspaceState.update(EnvironmentManager.ENV_STATE_KEY, undefined);

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
}
