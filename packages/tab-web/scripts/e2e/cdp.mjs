// Zero-dependency Chrome driver over CDP (Node 22+ has fetch and WebSocket built in).
// Drives the RENDERED page: a class-name grep or a build exit code cannot tell you a button is invisible.
import { execSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (p) msg.error ? p.rej(new Error(`${p.method}: ${msg.error.message}`)) : p.res(msg.result);
      } else for (const h of this.handlers.get(msg.method) ?? []) h(msg.params);
    };
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, cb) {
    this.handlers.set(method, [...(this.handlers.get(method) ?? []), cb]);
  }
  /** Evaluate an expression in the page and return its value. Throws if the page threw. */
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }
  /** Poll a page expression until it is truthy. A TIMEOUT is not evidence about the app until you have read the expression that ran. */
  async waitFor(expression, { timeout = 20000, label = expression } = {}) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try {
        last = await this.eval(expression);
        if (last) return last;
      } catch (e) {
        last = String(e);
      }
      await sleep(120);
    }
    throw new Error(`TIMEOUT waiting for: ${label} (last: ${JSON.stringify(last)})`);
  }
  async goto(url) {
    const loaded = new Promise((r) => this.once("Page.loadEventFired", r));
    await this.send("Page.navigate", { url });
    // A navigation that only changes the #hash never fires load, so do not wait on it forever.
    await Promise.race([loaded, sleep(2500)]);
  }
  once(method, cb) {
    const wrap = (p) => {
      this.handlers.set(method, (this.handlers.get(method) ?? []).filter((h) => h !== wrap));
      cb(p);
    };
    this.on(method, wrap);
  }
  async viewport(width, height, { dpr = 1, mobile = false } = {}) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  }
  /** Headless Chrome defaults to dark. Always set the scheme explicitly. */
  async media({ scheme = "dark", reducedMotion = "no-preference" } = {}) {
    await this.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: reducedMotion }] });
  }
  async shot(path, { fullPage = false, quality = 80 } = {}) {
    const jpeg = path.endsWith(".jpg");
    const r = await this.send("Page.captureScreenshot", { format: jpeg ? "jpeg" : "png", quality: jpeg ? quality : undefined, captureBeyondViewport: fullPage });
    writeFileSync(path, Buffer.from(r.data, "base64"));
    return path;
  }
  /** Click the first visible button, link or role=button whose text contains `text`. Returns the text it clicked, or throws. */
  async clickText(text, { exact = false } = {}) {
    const t = JSON.stringify(text);
    const hit = await this.eval(`(() => {
      const want = ${t}, exact = ${exact};
      const els = [...document.querySelectorAll('button, a, [role=button], summary')];
      const el = els.find((e) => { const r = e.getBoundingClientRect(); const s = (e.innerText || e.textContent || '').trim(); return r.width > 0 && r.height > 0 && !e.disabled && (exact ? s === want : s.includes(want)); });
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return (el.innerText || el.textContent).trim();
    })()`);
    if (!hit) throw new Error(`no enabled visible control with text: ${text}`);
    return hit;
  }
  /** Set a React-controlled input or textarea found by its label text, aria-label or placeholder. */
  async fill(labelText, value) {
    const ok = await this.eval(`(() => {
      const want = ${JSON.stringify(labelText)};
      let el = null;
      for (const l of document.querySelectorAll('label')) if ((l.textContent || '').trim().startsWith(want)) { el = l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector('input,textarea'); break; }
      el ??= document.querySelector('[aria-label^="' + want + '"]') || document.querySelector('[placeholder="' + want + '"]');
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!ok) throw new Error(`no field labelled: ${labelText}`);
  }
  async text() {
    return this.eval("document.body.innerText");
  }
}

export async function launch({ port = 9333 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "tab-chrome-"));
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 150 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch {
      /* not up yet */
    }
    if (!target) await sleep(100);
  }
  if (!target) throw new Error("Chrome did not expose a page target");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const close = () => {
    try {
      ws.close();
    } catch {}
    try {
      execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" });
    } catch {}
    // The profile is 60-70 MB; delete it so repeated runs do not fill the disk.
    setTimeout(() => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }, 800);
  };
  return { cdp, close };
}
