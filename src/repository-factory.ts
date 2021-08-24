import { DummyRepository } from './repositories/dummy';
import { FileRepository } from './repositories/file';
import { LocalGitRepository } from './repositories/local-git';
import { RemoteGitRepository } from './repositories/remote-git';
import { RsyncRepository } from './repositories/rsync';
import { Repository } from './repository';
import { RepositoryType } from './repository-type';
import { Settings } from './settings';

let $instance: Repository | undefined;

async function create(settings: Settings): Promise<void> { // {{{
	$instance = undefined;

	if(settings.repository.type === RepositoryType.DUMMY) {
		$instance = new DummyRepository(settings);
	}
	else if(settings.repository.type === RepositoryType.FILE) {
		$instance = new FileRepository(settings);
	}
	else if(settings.repository.type === RepositoryType.GIT) {
		if(settings.repository.path) {
			$instance = new LocalGitRepository(settings);
		}
		else if(settings.repository.url) {
			$instance = new RemoteGitRepository(settings);
		}
	}
	else if(settings.repository.type === RepositoryType.RSYNC) {
		$instance = new RsyncRepository(settings);
	}

	if(!$instance) {
		throw new Error(`The repository has a mysterious type: ${settings.repository.type}`);
	}

	return $instance.setProfile(settings.profile);
} // }}}

export namespace RepositoryFactory {
	export async function get(): Promise<Repository> { // {{{
		if($instance) {
			return $instance;
		}

		const settings = Settings.get();

		await create(settings);

		return $instance!;
	} // }}}

	export async function reload(): Promise<boolean> { // {{{
		const settings = Settings.get();

		if(await settings.reload()) {
			if($instance) {
				await $instance.terminate();

				await create(settings);
			}

			return true;
		}
		else {
			return false;
		}
	} // }}}

	export async function reset(): Promise<void> { // {{{
		if($instance) {
			await $instance.terminate();

			$instance = undefined;
		}
	} // }}}

	export async function setProfile(profile: string): Promise<void> { // {{{
		if($instance) {
			await $instance.setProfile(profile);
		}

		const settings = Settings.get();

		return settings.setProfile(profile);
	} // }}}
}
