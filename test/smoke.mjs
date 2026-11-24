/**
 * 离线冒烟测试（不参与打包，仅用于本地开发）。
 *
 * 用假的 window.__ModuleLoader__、React、Cordis 上下文执行 client.js，
 * 校验：模块 id、插件形状、slot 注册参数、中英文文案、组件能渲染。
 * 它不能替代在真实界面里看效果。
 *
 * 运行：node test/smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');

/** 最小 element 记录器，代替 React.createElement。 */
const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children });

const ReactStub = {
  createElement,
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: () => ({ current: null }),
  useEffect: () => {},
  useSyncExternalStore: (subscribe, getSnapshot) => {
    subscribe(() => {});
    return getSnapshot();
  },
};

let definition;
globalThis.window = {
  __ModuleLoader__: {
    load(value) { definition = value; },
  },
};
new Function(source)();

const assert = (condition, message) => {
  if (!condition) throw new Error('assertion failed: ' + message);
};

assert(definition && definition.id === 'dsh-plugin-greeting-bubble', 'module id');
const plugin = definition.factory((request) => {
  assert(request === 'react', 'only react is required, got ' + request);
  return ReactStub;
});
assert(Array.isArray(plugin.inject), 'plugin.inject');
assert(plugin.inject.includes('slots') && plugin.inject.includes('locale'), 'injected services');

let dictionaries;
let effectLabels = [];
let registrations = [];
let injectedKeys = [];
const ctx = {
  effect(fn, label) {
    effectLabels.push(label);
    const dispose = fn();
    assert(typeof dispose === 'function', 'effect returns a disposer: ' + label);
    return () => { dispose(); };
  },
  locale: {
    register(namespace, value) {
      dictionaries = { namespace, value };
      return () => {};
    },
    getSnapshot() {
      return { active: 'zh' };
    },
  },
  slots: {
    inject(key, callback) {
      injectedKeys.push(key);
      const effect = callback();
      if (typeof effect === 'function') effect();
      return () => {};
    },
    register(options, component) {
      registrations.push({ options, component });
      return () => {};
    },
  },
  remote: {
    account: {
      async getBalance() {
        return {
          ok: true,
          value: {
            status: 'ready',
            value: [{ currency: 'CNY', balance: '12.34' }],
            bonusWallets: [{ currency: 'CNY', balance: '3.00' }],
          },
        };
      },
      async getProfile() {
        return {
          ok: true,
          value: { status: 'ready', value: { name: '腾盛', contact: 't***@example.com' } },
        };
      },
    },
  },
};

plugin.apply(ctx);

assert(injectedKeys.includes('shell.overlay'), 'injects into shell.overlay');
assert(plugin.inject.includes('remote'), 'remote is injected');
assert(plugin.inject.includes('remote.account'), 'the account Remote namespace is injected');
assert(plugin.inject.includes('connection'), 'connection is injected');
const registered = registrations.find((entry) => entry.options.name === 'shell.overlay');
assert(registered, 'registers one overlay entry');
assert(registered.options.id === 'greeting-bubble', 'registration id');
assert(registered.options.locale === 'greetingBubble', 'registration locale namespace');
assert(typeof registered.options.order === 'number', 'registration order');
assert(dictionaries.namespace === 'greetingBubble', 'locale namespace');
assert(dictionaries.value.zh.greetingMorning === '早上好，腾盛', 'time-based greetings');
assert(dictionaries.value.zh.dismiss && dictionaries.value.en.dismiss, 'dismiss labels');
assert(dictionaries.value.zh.balance === '余额' && dictionaries.value.en.balance === 'Balance', 'balance label');
assert(dictionaries.value.zh.lowBalance === '余额不足', 'low balance label');
assert(dictionaries.value.zh.hideAmount && dictionaries.value.zh.showAmount, 'privacy labels');
assert(dictionaries.value.zh.connection && dictionaries.value.zh.today === '今日消费金额', 'connection and usage labels');

const face = registered.options.inject();
assert(typeof face.loadBalance === 'function', 'balance loader is injected');
assert(typeof face.loadProfile === 'function', 'profile loader is injected');
const balance = await face.loadBalance();
assert(balance.ok === true && balance.value.status === 'ready', 'balance resolves through the account Remote');
const profile = await face.loadProfile();
assert(profile.ok === true && profile.value.status === 'ready', 'profile resolves through the account Remote');

const t = (key) => dictionaries.value.zh[key];
const connection = {
  state: { getSnapshot: () => 'connected', subscribe: () => () => {} },
  reconnect: () => {},
};
const tree = registered.component({ t, loadBalance: face.loadBalance, loadProfile: face.loadProfile, connection });
const bubble = tree.children.find((child) => child && child.type === 'div' && child.props.className === 'dsh-greeting-bubble');
assert(bubble, 'bubble element rendered');
assert(bubble.props.role === undefined, 'the dismiss button stays outside the live region');
assert(typeof bubble.props.onPointerDown === 'function', 'bubble can start a drag');
assert(typeof bubble.props.onPointerMove === 'function', 'bubble follows the pointer');
assert(typeof bubble.props.onPointerUp === 'function', 'bubble finishes a drag');

const main = bubble.children.find((child) => child && child.type === 'div' && child.props.className === 'dsh-greeting-main');
assert(main, 'main row rendered');
const text = main.children.find((child) => child && child.type === 'span' && child.props.className === 'dsh-greeting-text');
assert(text && /好，腾盛$/.test(text.children[0]), 'rendered time-based greeting text');
assert(text.props.role === 'status', 'greeting text is the status region');
assert(text.props.lang === 'zh-CN', 'greeting text declares its language');
const close = main.children.find((child) => child && child.type === 'button');
assert(close && close.props['aria-label'] === '关闭问候气泡', 'close button label');

const toggle = bubble.children.find((child) => child && child.type === 'button' && child.props.className === 'dsh-greeting-toggle');
assert(toggle, 'balance toggle rendered');
assert(toggle.props['aria-expanded'] === 'false', 'details start collapsed');
assert(typeof toggle.props.onClick === 'function', 'toggle expands details');
const toggleText = toggle.children.find((child) => child && child.type === 'span' && typeof child.children[0] === 'string' && child.children[0].startsWith('余额'));
assert(toggleText && toggleText.children[0] === '余额 --', 'balance placeholder before the first read');
const details = bubble.children.find((child) => child && child.props && child.props.className === 'dsh-greeting-details');
assert(details === undefined, 'details are hidden while collapsed');

console.log('ok: module id, plugin shape, registration options, dictionaries, account Remote, and a render pass');
console.log('effects: ' + effectLabels.join(' | '));
