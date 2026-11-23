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
  useState: (initial) => [initial, () => {}],
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
let registered;
let injectedKey;
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
  },
  slots: {
    inject(key, callback) {
      injectedKey = key;
      const effect = callback();
      if (typeof effect === 'function') effect();
      return () => {};
    },
    register(options, component) {
      registered = { options, component };
      return () => {};
    },
  },
};

plugin.apply(ctx);

assert(injectedKey === 'shell.overlay', 'injects into shell.overlay');
assert(registered, 'registers one overlay entry');
assert(registered.options.name === 'shell.overlay', 'registration name');
assert(registered.options.id === 'greeting-bubble', 'registration id');
assert(registered.options.locale === 'greetingBubble', 'registration locale namespace');
assert(typeof registered.options.order === 'number', 'registration order');
assert(dictionaries.namespace === 'greetingBubble', 'locale namespace');
assert(dictionaries.value.zh.greeting === '你好，腾盛', 'zh greeting');
assert(dictionaries.value.en.greeting === '你好，腾盛', 'en greeting is the same fixed phrase');
assert(dictionaries.value.zh.dismiss && dictionaries.value.en.dismiss, 'dismiss labels');

const t = (key) => dictionaries.value.zh[key];
const tree = registered.component({ t });
const bubble = tree.children.find((child) => child && child.type === 'div' && child.props.className === 'dsh-greeting-bubble');
assert(bubble, 'bubble element rendered');
assert(bubble.props.role === undefined, 'the dismiss button stays outside the live region');
const text = bubble.children.find((child) => child && child.type === 'span' && child.props.className === 'dsh-greeting-text');
assert(text && text.children[0] === '你好，腾盛', 'rendered greeting text');
assert(text.props.role === 'status', 'greeting text is the status region');
assert(text.props.lang === 'zh-CN', 'greeting text declares its language');
const close = bubble.children.find((child) => child && child.type === 'button');
assert(close && close.props['aria-label'] === '关闭问候气泡', 'close button label');

console.log('ok: module id, plugin shape, registration options, dictionaries, and a render pass');
console.log('effects: ' + effectLabels.join(' | '));
