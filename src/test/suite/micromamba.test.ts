
import * as assert from 'assert';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/naming-convention
const proxyquire = require('proxyquire').noCallThru();

suite('Micromamba Conflict Test Suite', () => {

    let commandCalls: string[] = [];
    let mockConfig: { [key: string]: any } = {};

    // Mock VS Code
    const vscodeMock = {
        ExtensionContext: class { },
        Uri: { file: (f: string) => ({ fsPath: f, scheme: 'file', toString: () => f }) },
        workspace: {
            workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
            getWorkspaceFolder: (uri: any) => ({ uri: { fsPath: '/mock/workspace' }, index: 0, name: 'Workspace' }),
            getConfiguration: () => ({
                get: (key: string, def?: any) => {
                    if (key in mockConfig) return mockConfig[key];
                    return def;
                },
                update: () => Promise.resolve()
            })
        },
        commands: {
            getCommands: (filter: boolean) => Promise.resolve([
                'micromamba.deactivate', // Simulate this command existing
                'other.command'
            ]),
            executeCommand: (cmd: string, ...args: any[]) => {
                commandCalls.push(cmd);
                return Promise.resolve();
            }
        },
        window: {
            showInformationMessage: () => Promise.resolve(),
            showErrorMessage: (msg: string) => console.error(msg),
            createStatusBarItem: () => ({
                show: () => { },
                hide: () => { },
                dispose: () => { },
                text: '',
                command: '',
                tooltip: ''
            }),
            createTerminal: (name: string) => ({
                show: () => { },
                sendText: () => { },
                dispose: () => { },
                exitStatus: { code: 0 }
            }),
            withProgress: async (opts: any, task: any) => await task({ report: () => { } }),
            showQuickPick: () => Promise.resolve(undefined)
        },
        StatusBarAlignment: { Left: 1, Right: 2 },
        // Minimal mocks effectively needed for EnvironmentManager instantiation
        ProgressLocation: { Notification: 15 }
    };

    // Mock FS
    const fsMock = {
        existsSync: (p: string) => true, // Start with everything existing
        promises: {
            readFile: (p: string) => Promise.resolve(''),
            writeFile: (p: string, c: string) => Promise.resolve()
        }
    };

    // Mock global child_process
    const cpMock = {
        exec: (cmd: string, opts: any, cb: any) => {
            // Mock pixi info --json
            if (cmd.includes('info --json')) {
                cb(null, JSON.stringify({ environments_info: [{ name: 'default', prefix: '/mock/prefix' }] }), '');
            } else if (cmd.includes('pixi shell-hook')) {
                cb(null, 'export FOO=BAR', '');
            } else {
                cb(null, '', '');
            }
        }
    };

    // Import EnvironmentManager with mocks
    const EnvironmentManager = proxyquire('../../environment', {
        'vscode': vscodeMock,
        'fs': fsMock,
        'child_process': cpMock,
        'path': path
    }).EnvironmentManager;

    let envManager: any;
    let context: any;
    let mockPixiManager: any;

    setup(() => {
        commandCalls = [];
        mockConfig = {};
        context = {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve()
            },
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve()
            },
            environmentVariableCollection: {
                replace: () => { },
                clear: () => { }
            },
            extensionPath: '/mock/extension/path'
        };
        mockPixiManager = {
            isPixiInstalled: () => Promise.resolve(true),
            getPixiPath: () => Promise.resolve('/usr/bin/pixi')
        };
        envManager = new EnvironmentManager(mockPixiManager, context);
    });

    test('Activate attempts to deactivate micromamba if conflicting command exists', async () => {
        // Run activate
        // We expect it to find a known command in getCommands (mocked)
        // Then execute it.
        await envManager.activate();

        // Check if deactivate was called
        const deactivateCalled = commandCalls.includes('micromamba.deactivate');
        assert.ok(deactivateCalled, 'Should have called micromamba.deactivate');
    });

    test('Activate does NOT deactivate if no conflicting command is found', async () => {
        // Override getCommands to NOT return the known candidates
        vscodeMock.commands.getCommands = (filter: boolean) => Promise.resolve(['other.command']);

        // Reset calls
        commandCalls = [];

        await envManager.activate();

        const deactivateCalled = commandCalls.includes('micromamba.deactivate');
        assert.ok(!deactivateCalled, 'Should not have called deactivate');
    });

    test('Activate finds alternative command names', async () => {
        // Override getCommands to return an alternative
        vscodeMock.commands.getCommands = (filter: boolean) => Promise.resolve(['corker.micromamba.deactivate.environment']);

        // Reset calls
        commandCalls = [];

        await envManager.activate();

        const deactivateCalled = commandCalls.includes('corker.micromamba.deactivate.environment');
        assert.ok(deactivateCalled, 'Should have called corker.micromamba.deactivate.environment');
    });
});
