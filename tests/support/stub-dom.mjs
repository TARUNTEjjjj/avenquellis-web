// A minimal DOM, enough to run dist/app.js in Node: its pages are parsed only into the elements and attributes
// the app looks up, events are dispatched by hand, and the app's one-second timer runs only when tick() is called.
// It is not a browser. Each test file runs in its own process, so app.js can be imported once per file.
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join} from 'node:path';

const unescape = s => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** localStorage with a quota in UTF-16 code units over keys and values. While `blocked`, using it throws. */
export function createStorage({quota = Infinity, initial = {}} = {}) {
  const data = new Map(Object.entries(initial));
  const used = skip => [...data].reduce((n, [k, v]) => n + (k === skip ? 0 : k.length + v.length), 0);
  return {
    quota, data, blocked: false,
    get length() { return data.size; },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      v = String(v);
      if (used(k) + k.length + v.length > this.quota)
        throw Object.assign(new Error('The quota has been exceeded.'), {name: 'QuotaExceededError', code: 22});
      data.set(k, v);
    },
    removeItem: k => void data.delete(k),
  };
}

export function createDom({dist, hash = '', storage = createStorage(), fetchImpl}) {
  let generation = 0;
  class El {
    constructor(tagName = 'div', attrs = {}, container = null) {
      this.tagName = tagName.toUpperCase();
      this.attrs = {...attrs};
      this.id = attrs.id ?? '';
      this.className = attrs.class ?? '';
      this.dataset = {};
      for (const [k, v] of Object.entries(attrs)) if (k.startsWith('data-')) this.dataset[camel(k.slice(5))] = v;
      this.value = attrs.value ?? '';
      this.type = attrs.type ?? '';
      this.textContent = '';
      this.hidden = 'hidden' in attrs;
      this.disabled = 'disabled' in attrs;
      this.checked = 'checked' in attrs;
      this.open = false;
      this.title = attrs.title ?? '';
      this.selectionStart = 0; this.selectionEnd = 0;
      this.maxLength = attrs.maxlength != null ? Number(attrs.maxlength) : -1;
      this.files = [];
      this.options = [];
      this.style = {};
      this.children = [];
      this._html = '';
      this._listeners = {};
      this._container = container;
      this._generation = container ? container._childGeneration : null;
      this._childGeneration = 0;
      this._parsed = [];
      const classes = new Set(this.className.split(/\s+/).filter(Boolean));
      this.classList = {
        add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
        toggle: (c, force) => { const on = force ?? !classes.has(c); on ? classes.add(c) : classes.delete(c); return on; },
      };
      this.ownerDocument = doc;
    }
    // An element stays connected until its container's content is replaced.
    get isConnected() { return !this._container || (this._container._childGeneration === this._generation && this._container.isConnected); }
    get innerHTML() { return this._html; }
    set innerHTML(html) {
      this._html = String(html); this._childGeneration = ++generation; this.children = [];
      this._parsed = parse(this._html, this);
      this.textContent = '';
    }
    // The parent of a parsed element is not modelled: what is appended to it joins the same container.
    get parentElement() {
      if (this._parent) return this._parent;
      const container = this._container, parent = new El('div', {}, container);
      parent.append = (...nodes) => container.append(...nodes);
      return (this._parent = parent);
    }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; }
    hasAttribute(k) { return k in this.attrs; }
    addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); }
    removeEventListener(type, fn) { this._listeners[type] = (this._listeners[type] ?? []).filter(f => f !== fn); }
    dispatchEvent(event) {
      try { Object.defineProperty(event, 'target', {value: this, configurable: true}); } catch {}
      this['on' + event.type]?.(event);
      for (const fn of this._listeners[event.type] ?? []) fn(event);
      return true;
    }
    click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
    focus() { doc.activeElement = this; }
    blur() {}
    scrollIntoView() {}
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.selectionStart = this.selectionEnd = start + text.length; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    append(...nodes) { for (const n of nodes) if (n instanceof El) { n._container = this; n._generation = this._childGeneration; this.children.push(n); } }
    replaceChildren(...nodes) { this._html = ''; this._childGeneration = ++generation; this._parsed = []; this.children = []; this.append(...nodes); }
    insertAdjacentElement(_where, node) { node._container = this._container; node._generation = this._generation; (this._container?.children ?? []).push(node); return node; }
    remove() { this._generation = -1; }
    requestSubmit() { this.dispatchEvent(Object.assign(new Event('submit'), {preventDefault() {}})); }
    getRootNode() { return doc; }
    getContext() { return null; }
    closest() { return null; }
    getBoundingClientRect() { return {width: 0, height: 0, left: 0, top: 0}; }
    getClientRects() { return []; }
    // Elements parsed from this one's HTML, and what was written into them or appended since.
    all() { return [...this._parsed, ...this.children].flatMap(c => [c, ...c.all()]); }
    // An element parsed out of a container's HTML has no subtree of its own here: search its container instead.
    querySelectorAll(selector) {
      const own = this.all();
      return select(selector, own.length || !this._container ? own : this._container.all());
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  }
  function parse(html, container) {
    const out = [];
    const tag = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'=<>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
    let m, select = null;
    while ((m = tag.exec(html))) {
      const attrs = {};
      const attr = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let a;
      while ((a = attr.exec(m[2]))) attrs[a[1].toLowerCase()] = unescape(a[2] ?? a[3] ?? a[4] ?? '');
      const el = new El(m[1], attrs, container);
      if (el.tagName === 'TEXTAREA') {
        const close = html.indexOf('</textarea>', tag.lastIndex);
        el.value = unescape(html.slice(tag.lastIndex, close < 0 ? tag.lastIndex : close));
      }
      if (el.tagName === 'SELECT') select = el;
      if (el.tagName === 'OPTION' && select) {
        const close = html.indexOf('<', tag.lastIndex);
        const option = {value: 'value' in attrs ? attrs.value : unescape(html.slice(tag.lastIndex, close)).trim(), disabled: false, selected: 'selected' in attrs};
        select.options.push(option);
        if (option.selected || select.options.length === 1) select.value = option.value;
      }
      out.push(el);
    }
    return out;
  }
  // Supports #id, .class, tag, [attr] and [attr=value]. Of a descendant selector, only the last part is matched.
  function matches(el, simple) {
    const parts = simple.match(/(#[\w-]+|\.[\w-]+|\[[^\]]+\]|^[a-zA-Z][\w-]*)/g);
    if (!parts) return false;
    return parts.every(part => {
      if (part[0] === '#') return el.id === part.slice(1);
      if (part[0] === '.') return el.classList.contains(part.slice(1));
      if (part[0] === '[') {
        const [, name, value] = part.match(/^\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
        return name in el.attrs && (value === undefined || el.attrs[name] === value);
      }
      return el.tagName === part.toUpperCase();
    });
  }
  function select(selector, pool) {
    const results = [];
    for (const alternative of selector.split(',')) {
      const last = alternative.trim().split(/\s+/).pop();
      for (const el of pool) if (matches(el, last) && !results.includes(el)) results.push(el);
    }
    return results;
  }

  const docTarget = new EventTarget();
  const doc = {
    title: '', hidden: false, visibilityState: 'visible', activeElement: null,
    addEventListener: (...a) => docTarget.addEventListener(...a), removeEventListener: (...a) => docTarget.removeEventListener(...a),
    dispatchEvent: e => docTarget.dispatchEvent(e),
    createElement: tag => new El(tag),
    getElementById: id => doc.querySelector('#' + id),
    querySelector(selector) { return statics[selector] ?? select(selector, pool())[0] ?? null; },
    querySelectorAll(selector) { return selector === '#nav a' ? nav : select(selector, pool()); },
  };
  // The page shell from index.html that app.js uses.
  const statics = {};
  const mk = (key, tag, attrs = {}) => (statics[key] = new El(tag, attrs));
  const main = mk('#main', 'main', {id: 'main'}), modal = mk('#modal', 'dialog', {id: 'modal'});
  mk('#modal-content', 'div', {id: 'modal-content'});
  mk('#toast', 'div', {id: 'toast'}); mk('#breadcrumb', 'b', {id: 'breadcrumb'}); mk('#motion', 'button', {id: 'motion'});
  mk('#offline-status', 'span', {id: 'offline-status'}); mk('.sidebar', 'aside', {class: 'sidebar'});
  mk('.mobile-menu', 'button', {class: 'mobile-menu'}); mk('.skip', 'a', {class: 'skip'});
  mk('.close-modal', 'button', {class: 'close-modal'}); mk('.local-status', 'span', {class: 'local-status'});
  mk('#nav .nav-tag', 'span', {class: 'nav-tag'});
  const nav = ['overview', 'tests', 'chapters', 'bank', 'generator', 'arithmetic', 'proof', 'progress', 'sources'].map(p => new El('a', {'data-page': p, href: '#' + p}));
  doc.body = new El('body');
  const pool = () => [...Object.values(statics), ...nav, ...main.all(), ...statics['#modal-content'].all(), ...doc.body.all()];

  const win = new EventTarget();
  const loc = {
    _hash: hash,
    get hash() { return this._hash; },
    set hash(value) {
      const next = value ? (String(value).startsWith('#') ? String(value) : '#' + value) : '';
      if (next === this._hash) return;
      this._hash = next;
      queueMicrotask(() => win.dispatchEvent(new Event('hashchange')));
    },
    origin: 'https://avenquellis.test', href: 'https://avenquellis.test/', protocol: 'https:',
  };
  const intervals = [], blobs = [];
  const files = async input => {
    const url = String(input?.url ?? input);
    if (url.startsWith('file:'))
      return new Response(await readFile(fileURLToPath(url)), {headers: {'Content-Type': url.endsWith('.wasm') ? 'application/wasm' : 'application/json'}});
    if (/^\.\/[\w./-]+\.json$/.test(url)) return new Response(await readFile(join(dist, url)), {headers: {'Content-Type': 'application/json'}});
    throw new TypeError('Failed to fetch');
  };
  const timeout = globalThis.setTimeout;
  Object.assign(win, {document: doc, location: loc, scrollTo() {}, devicePixelRatio: 1,
    matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}})});
  const globals = {
    window: win, document: doc, location: loc, navigator: {onLine: true}, matchMedia: win.matchMedia,
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    MutationObserver: class { observe() {} disconnect() {} },
    // The app's own timers never keep the test process alive.
    setTimeout: (...args) => { const timer = timeout(...args); timer.unref?.(); return timer; },
    setInterval: fn => intervals.push(fn),
    clearInterval: () => {},
    fetch: fetchImpl ? (input, init) => fetchImpl(input, init, files) : files,
  };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, {value, writable: true, configurable: true});
  // Reading localStorage throws while the browser blocks storage.
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, get() {
    if (storage.blocked) throw new DOMException('The operation is insecure.', 'SecurityError');
    return storage;
  }});
  URL.createObjectURL = blob => { blobs.push(blob); return 'blob:' + blobs.length; };
  URL.revokeObjectURL = () => {};
  return {win, doc, loc, main, modal, storage, blobs,
    $: s => doc.querySelector(s), $$: s => doc.querySelectorAll(s),
    // One second of the app's timer.
    tick: () => { for (const fn of intervals) fn(); },
    appUrl: pathToFileURL(join(dist, 'app.js')).href};
}
