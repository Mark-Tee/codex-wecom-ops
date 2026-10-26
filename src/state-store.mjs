import fs from "node:fs";
import path from "node:path";

export class StateStore {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, "state.json");
  }

  load() {
    if (!fs.existsSync(this.file)) return {};
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  save(state) {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.renameSync(temporary, this.file);
    } catch {
      fs.copyFileSync(temporary, this.file);
      fs.rmSync(temporary, { force: true });
    }
    try {
      fs.chmodSync(this.file, 0o600);
    } catch {}
  }

  writePrivateFile(name, content) {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const target = path.join(this.directory, name);
    fs.writeFileSync(target, content, { mode: 0o600 });
    try {
      fs.chmodSync(target, 0o600);
    } catch {}
    return target;
  }
}
