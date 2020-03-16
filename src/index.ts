import * as Promise from 'bluebird';

import * as path from 'path';
import * as winapi from 'winapi-bindings';

import { log, types, util } from 'vortex-api';

const STORE_ID = 'uplay';
const UPLAY_EXEC = 'Uplay.exe';
const REG_UPLAY_INSTALLS = 'SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs';
const REG_UPLAY_NAME_LOCATION =
  'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Uplay Install ';

/**
 * base class to interact with local Uplay game store.
 * @class UPlayLauncher
 */
class UPlayLauncher implements types.IGameStore {
  public id: string;
  private mClientPath: Promise<string>;
  private mCache: Promise<types.IGameStoreEntry[]>;

  constructor() {
    this.id = STORE_ID;
    if (process.platform === 'win32') {
      // No Windows, no uplay launcher!
      try {
        const uplayPath = winapi.RegGetValue('HKEY_LOCAL_MACHINE',
          'SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher', 'InstallDir');
        this.mClientPath = Promise.resolve(path.join(uplayPath.value as string, UPLAY_EXEC));
      } catch (err) {
        log('info', 'uplay launcher not found', { error: err.message });
        this.mClientPath = Promise.resolve(undefined);
      }
    } else {
      log('info', 'uplay launcher not found', { error: 'only available on Windows systems' });
    }
  }

  // It seems that the appId's the launcher is storing in registry are
  //  different from the ids uplay is using to launch the game..
  //  for example - Assassin's Creed Black Flag is stored as '273' in registry
  //  but the posix path used to launch the game uses '619'
  public launchGame(appInfo: any, api?: types.IExtensionApi): Promise<void> {
    return this.getPosixPath(appInfo)
      .then(posPath => util.opn(posPath).catch(err => Promise.resolve()));
  }

  // To note: UPlay can launch multiple executables for a game.
  //  The way they differentiate between executables is using the appended
  //  digit at the end of the posix path.
  //  e.g. 'uplay://launch/619/0' will launch Assassin's Creed Black Flag (Singleplayer)
  //  while 'uplay://launch/619/1' will launch Assassin's Creed Black Flag (Multiplayer)
  //  '0' seems to be the default value reason why we simply hard code it; we may
  //  need to change this in the future to allow game extensions to choose the executable
  //  they want to launch.
  public getPosixPath(appId) {
    const posixPath = `uplay://launch/${appId}/0`;
    return Promise.resolve(posixPath);
  }

  public allGames(): Promise<types.IGameStoreEntry[]> {
    if (!this.mCache) {
      this.mCache = this.getGameEntries();
    }
    return this.mCache;
  }

  private getGameEntries(): Promise<types.IGameStoreEntry[]> {
    return new Promise<types.IGameStoreEntry[]>((resolve, reject) => {
      try {
        winapi.WithRegOpen('HKEY_LOCAL_MACHINE', REG_UPLAY_INSTALLS, hkey => {
          const keys = winapi.RegEnumKeys(hkey);
          const gameEntries: types.IGameStoreEntry[] = keys.map(key => {
            const gameEntry: types.IGameStoreEntry = {
              appid: key.key,
              gamePath: winapi.RegGetValue(hkey,
                key.key, 'InstallDir').value as string,
              // Unfortunately the name of this game is stored elsewhere.
              name: winapi.RegGetValue('HKEY_LOCAL_MACHINE',
                REG_UPLAY_NAME_LOCATION + key.key, 'DisplayName').value as string,
              gameStoreId: STORE_ID,
            };
            return gameEntry;
          });
          return resolve(gameEntries);
        });
      } catch (err) {
        return (err.code === 'ENOENT') ? resolve([]) : reject(err);
      }
    });
  }
}

function main(context: types.IExtensionContext) {
  const instance: types.IGameStore =
    process.platform === 'win32' ? new UPlayLauncher() : undefined;

  if (instance !== undefined) {
    context.registerGameStore(instance);
  }

  return true;
}

export default main;
