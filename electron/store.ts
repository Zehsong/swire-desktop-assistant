import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { initialState, stateSchema, type State } from '../src/model';
export class Store {
  constructor(readonly directory: string) {}
  private get file() {
    return path.join(this.directory, 'state.json');
  }
  async load(): Promise<State> {
    try {
      return stateSchema.parse(JSON.parse(await readFile(this.file, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return initialState();
      throw new Error(
        'Local data could not be read. It has not been overwritten. Back up state.json and consult the README recovery steps.',
      );
    }
  }
  async save(state: State): Promise<void> {
    const valid = stateSchema.parse(state);
    await mkdir(this.directory, { recursive: true });
    try {
      await copyFile(this.file, `${this.file}.bak`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await writeFile(`${this.file}.tmp`, JSON.stringify(valid, null, 2), {
      mode: 0o600,
    });
    await rename(`${this.file}.tmp`, this.file);
  }
}
