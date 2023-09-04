import { createHash } from 'crypto';
import fse from 'fs-extra';
import { ExtensionContext, ExtensionKind, Terminal, TerminalOptions, Uri, window } from 'vscode';
import yaml from 'yaml';
import { RepositoryType } from './repository-type';
import { exists } from './utils/exists';
import { getEditorStorage } from './utils/get-editor-storage';
import { Logger } from './utils/logger';

const $hasher = createHash('SHA1');

let $instance: Settings | undefined;
let $terminal: Terminal | undefined;

function defaults() { // {{{
	return {
		hostname: '',
		repository: {
			type: RepositoryType.DUMMY,
			path: '',
		},
		profile: 'main',
	};
} // }}}

export interface Hooks {
	preDownload?: string | string[];
	postDownload?: string | string[];
	preUpload?: string | string[];
	postUpload?: string | string[];
}

export interface RepositorySettings {
	branch?: string;
	messages?: Record<string, string>;
	path?: string;
	shell?: string;
	type: RepositoryType;
	url?: string;
}

interface SettingsData {
	extensionKind?: 'auto' | 'ui' | 'workspace';
	hooks?: Hooks;
	hostname?: string;
	profile?: string;
	repository?: RepositorySettings;
}

export class Settings {
	public readonly extensionId: string;
	public readonly globalStorageUri: Uri;
	public readonly settingsUri: Uri;

	private _hash = '';
	private _hooks: Hooks = {};
	private _hostname?: string;
	private _profile: string = '';
	private _remote: boolean = false;
	private _repository: RepositorySettings = {
		type: RepositoryType.DUMMY,
	};

	private constructor(id: string, globalStorageUri: Uri, settingsUri: Uri, remote: boolean) { // {{{
		this.extensionId = id;
		this.globalStorageUri = globalStorageUri;
		this.settingsUri = settingsUri;
		this._remote = remote;
	} // }}}

	public get hooks() { // {{{
		return this._hooks;
	} // }}}

	public get hostname() { // {{{
		return this._hostname;
	} // }}}

	public get profile() { // {{{
		return this._profile;
	} // }}}

	public get remote() { // {{{
		return this._remote;
	} // }}}

	public get repository() { // {{{
		return this._repository;
	} // }}}

	public static get(): Settings { // {{{
		if($instance) {
			return $instance;
		}

		throw new Error('The settings are not initialized');
	} // }}}

	public static async load(context: ExtensionContext): Promise<Settings> { // {{{
		const settingsPath = Uri.joinPath(context.globalStorageUri, 'settings.yml');

		$instance = new Settings(context.extension.id, context.globalStorageUri, settingsPath, context.extension.extensionKind === ExtensionKind.Workspace);

		const data = await exists(settingsPath.fsPath) ? await fse.readFile(settingsPath.fsPath, 'utf-8') : null;

		if(data) {
			$instance.set(yaml.parse(data) ?? {});

			$instance._hash = $hasher.copy().update(data ?? '').digest('hex');
		}
		else {
			const defaultSettingsPath = Uri.joinPath(context.extensionUri, 'src', 'resources', 'default-settings.yml');

			if(await exists(defaultSettingsPath.fsPath)) {
				const data = await fse.readFile(defaultSettingsPath.fsPath, 'utf-8');

				$instance.set(yaml.parse(data) ?? {});

				await fse.ensureDir(Uri.joinPath($instance.settingsUri, '..').fsPath);

				await fse.writeFile($instance.settingsUri.fsPath, data, {
					encoding: 'utf-8',
					mode: 0o600,
				});

				$instance._hash = $hasher.copy().update(data ?? '').digest('hex');
			}
			else {
				$instance.set(defaults());

				await $instance.save();
			}
		}

		void getEditorStorage(context);

		return $instance;
	} // }}}

	public static async getTerminal(workingDirectory: string): Promise<Terminal> { // {{{
		if(!$terminal) {
			$terminal = window.createTerminal({
				name: 'Sync Settings',
				cwd: workingDirectory,
				isTransient: true,
			});
		}
		else if(($terminal.creationOptions as TerminalOptions).cwd !== workingDirectory) {
			$terminal.dispose();

			$terminal = window.createTerminal({
				name: 'Sync Settings',
				cwd: workingDirectory,
				isTransient: true,
			});
		}
		else {
			await $terminal.processId.then((processId) => {
				if(!processId) {
					$terminal = window.createTerminal({
						name: 'Sync Settings',
						cwd: workingDirectory,
						isTransient: true,
					});
				}
			});
		}

		$terminal.show(false);

		return $terminal;
	} // }}}

	public async reload(): Promise<boolean> { // {{{
		const data = await exists(this.settingsUri.fsPath) ? await fse.readFile(this.settingsUri.fsPath, 'utf-8') : null;
		const hash = $hasher.copy().update(data ?? '').digest('hex');

		if(this._hash !== hash) {
			if(data) {
				this.set(yaml.parse(data) ?? {});
			}
			else {
				this.set(defaults());
			}

			this._hash = hash;

			return true;
		}
		else {
			return false;
		}
	} // }}}

	public async save(): Promise<void> { // {{{
		const settings: SettingsData = {};

		if(Object.keys(this._hooks).length > 0) {
			settings.hooks = this._hooks;
		}

		if(typeof this._hostname === 'string') {
			settings.hostname = this._hostname;
		}

		settings.profile = this._profile;
		settings.repository = this._repository;

		settings.profile = this._profile;
		settings.repository = this._repository;

		const data = yaml.stringify(settings);

		this._hash = $hasher.copy().update(data ?? '').digest('hex');

		await fse.ensureDir(Uri.joinPath(this.settingsUri, '..').fsPath);

		await fse.writeFile(this.settingsUri.fsPath, data, {
			encoding: 'utf-8',
			mode: 0o600,
		});
	} // }}}

	public async setProfile(profile: string): Promise<void> { // {{{
		this._profile = profile;

		return this.save();
	} // }}}

	private set(data: SettingsData) { // {{{
		Logger.info('repository:', JSON.stringify(data.repository, (key: string, value: unknown) => key === 'password' || key === 'token' ? '...' : value));
		if(data.profile) {
			Logger.info('profile:', data.profile);
		}
		else {
			Logger.error('The `profile` property is required');
		}

		if(data.hostname) {
			Logger.info('hostname:', data.hostname);
		}

		if(data.extensionKind && data.extensionKind !== 'auto') {
			this._remote = data.extensionKind === 'workspace';
		}

		if(data.repository) {
			this._hooks = data.hooks ?? {};
			this._hostname = data.hostname;
			this._profile = data.profile ?? '';
			this._repository = data.repository;
		}
		else {
			this._hooks = data.hooks ?? {};
			this._hostname = '';
			this._profile = '';
			this._repository = {
				type: RepositoryType.DUMMY,
			};

			Logger.error('No `repository` property has been defined in the settings');
		}
	} // }}}
}
