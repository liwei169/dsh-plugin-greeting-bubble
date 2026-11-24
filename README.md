# dsh-plugin-greeting-bubble · 你好，腾盛

一个用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web 界面的小型 UI 插件：页面加载后，在**窗口右下角**弹出「你好，腾盛」问候气泡，点 × 即可关闭。

- 不联网、不收集任何数据、不读写会话内容；
- 不修改 DSH 自带界面，只是往整帧浮层 `shell.overlay` 里加一个自己的气泡；
- 跟随亮色 / 暗色主题，支持键盘操作与 `prefers-reduced-motion`；
- Host 端不执行任何逻辑（`apply()` 为空），只负责让浏览器半加载。

> 适配版本：DeepSeek Harness **0.2.2-rc.5**（Desktop 与浏览器 Web GUI）。

---

## 目录

- [效果](#效果)
- [安装](#安装)
- [使用](#使用)
- [自定义](#自定义)
- [工作原理（完整流程）](#工作原理完整流程)
- [文件结构](#文件结构)
- [本地开发与测试](#本地开发与测试)
- [兼容性与限制](#兼容性与限制)
- [English](#english)
- [License](#license)

---

## 效果

- 页面加载约 0.35 秒后，右下角（距右 20px、距底 84px，即输入框发送按钮上方）淡入气泡：👋 早上好/中午好/下午好/晚上好，腾盛 ×（按当前时间变化）
- **第二行显示账号余额**：`余额 ¥12.34`，来自当前登录的 DeepSeek 账号；每 60 秒刷新一次。
- **余额低于 3 元**时，这一行变橙并显示「余额不足」提醒。
- **点余额这一行展开详情**：账户名/联系方式、**连接状态（断开时可一键重连）**、**今日消费金额估算**、充值余额、最近更新时间，以及「用量」「充值」快捷入口；再点一次收起。
  - 今日消费金额只显示金额（`≈ ¥x.xx`）；口径是基准余额 − 当前余额，优先用**昨天最后一次读到的余额**（≈ 0 点余额），没有昨天数据则用**今天第一次读到的余额**；充值会使基准同步抬高，不计入消费。
  - **安装插件之前、或 DSH 未运行期间**的消费无法统计，所以这是“自基准时间起”的估算，不是平台账单。
- 详情里可以**隐藏金额（隐私模式）**：金额变为 `••••` 并记住，适合截图/录屏。
- 未登录、账号服务不可用或请求失败时显示 `余额 --`，不影响气泡的其他功能。
- 点气泡右侧的 **×** 关闭；关闭只对当前页面生效，**刷新页面后会再次出现**。
- **按住气泡可以拖动**：光标变成抓手，拖到任意位置松手即可；位置会记在浏览器里，下次打开（包括刷新）仍在原处。
- 默认位置刻意抬到输入框上方，不会盖住发送按钮；拖动后由你决定位置。气泡本体需要接收拖动事件，所以它所在的小块区域会接住点击，其余区域不受影响。
- 在「插件」「设置」等页面同样显示（浮层属于整个应用框架）。
- 进入动画在系统开启“减少动态效果”时自动关闭；窄窗口下气泡最大宽度自动收缩，不会被拖出屏幕（拖动时自动限制在可视区内）。

## 安装

四种方式任选其一。都需要本机可用的 `pnpm`（DSH 插件安装自带）；GitHub 安装还需要能访问 `github.com` 的 `git`。

### 方式一：从 npm 安装（最稳，推荐）

插件发布到 npm 后，在 **插件 → 添加插件** 中直接填包名：

```
dsh-plugin-greeting-bubble
```

安装走 npm 源（国内可用镜像兜底），不经过 GitHub 的网络检查；发布新版本后还能在插件页直接“更新”。

### 方式二：从 GitHub 直接安装

1. 打开 DSH Web 界面，左侧边栏进入 **插件**。
2. 点右上角 **添加插件**。
3. 在「包名或地址」中填入仓库地址（把用户名换成实际的）：

   ```
   https://github.com/liwei169/dsh-plugin-greeting-bubble
   ```

   也支持 pnpm 的简写：`github:liwei169/dsh-plugin-greeting-bubble`。
4. 点 **安装**，等待下载完成。安装成功后会自动启用，气泡随即出现（页面已打开时通常无需刷新；若没出现，刷新一次）。

### 方式三：本地目录安装

```powershell
git clone https://github.com/liwei169/dsh-plugin-greeting-bubble.git
```

然后在 **插件 → 添加插件** 中填入克隆下来的本地目录路径（例如 `D:\dsh-plugin-greeting-bubble`）并安装。

> 本地目录安装是软链接（`link:`）：移动或删除该目录，插件会失效。长期使用建议用方式一或方式二。

### 方式四：让 agent 安装

在 DSH 对话里说“安装 D:\dsh-plugin-greeting-bubble 这个插件”，agent 会调用 `plugin_manager` 的 `install_bundle` 完成同样的步骤。

### 验证安装

- **插件** 页的「已安装插件」列表里出现 **Greeting bubble / 右下角问候气泡**，状态为运行中；
- 右下角出现气泡。

## 使用

| 操作 | 结果 |
| --- | --- |
| 页面加载 | 气泡出现（每个页面视图一次），并读取一次余额 |
| **按住气泡拖动** | 气泡跟着指针移动，松手后记住位置 |
| **点余额那一行** | 展开/收起详情（账户、会话、连接、今日估算、钱包明细、更新时间、版本、快捷入口） |
| 详情里的「重连」 | 连接断开时出现，点击立即重连 Host |
| 详情里的「刷新」 | 立即刷新余额（不用等 60 秒） |
| 详情里的「隐藏金额 / 显示金额」 | 切换隐私模式并记住 |
| 余额低于 ¥3 | 余额行变橙并显示「余额不足」 |
| 点 ×（或聚焦后按 Enter / Space） | 本次页面隐藏气泡 |
| 刷新页面 | 气泡再次出现，位置保持上次拖到的位置 |
| 插件页关闭该包的开关 | 气泡立即消失（HMR 生效时无需刷新） |
| 插件页卸载该包 | 彻底移除，不再出现 |

## 自定义

所有可改的东西都在两三个文件里，改完保存即可（开发模式自动热重载；正式安装需要重装或重启 DSH 后生效）。

### 1. 改问候语

编辑 `client.js` 中 `apply()` 里的字典（`zh` / `en` 两处）：

```js
zh: { greeting: '你好，腾盛', dismiss: '关闭问候气泡' },
en: { greeting: '你好，腾盛', dismiss: 'Dismiss greeting' },
```

问候语刻意在两种语言下保持一致（它是这个插件固定的“签名语”），只有关闭按钮的提示文字跟随界面语言。想让英文界面显示英文问候，把 `en.greeting` 改成 `Hello, Tengsheng` 即可。

### 2. 改默认位置 / 拖动记忆

默认位置在 `client.js` 的 `.dsh-greeting-bubble` 里：

```css
right: calc(20px + env(safe-area-inset-right, 0px));
bottom: calc(84px + env(safe-area-inset-bottom, 0px)); /* 输入框发送按钮上方 */
```

改成 `left` / `top` 就能换角；把 `20px` 调大即离边更远。`bottom` 不要低于 `84px`：DSH 的发送按钮在输入卡右下角，贴近底边会在窄窗口下盖住它。

拖动后的位置保存在 localStorage 的 `dsh-greeting-bubble:position:v1` 键里。想恢复默认位置，在浏览器控制台执行：

```js
localStorage.removeItem('dsh-greeting-bubble:position:v1')
```

然后刷新页面即可。

### 3. 改视觉

- 圆角、描边、阴影：`--dsw-radius-lg`、`--dsw-elevation-stroke-color`、`--dsw-elevation-prominent`，与 DSH 原生浮层一致；
- 底/字色：`--dsw-alias-bg-layer-3`、`--dsw-alias-label-primary`，自动跟随亮/暗主题；
- 尺寸与字号：`.dsh-greeting-bubble` 的 `font-size`、`gap`、`padding`。

### 4. 改余额刷新频率

`client.js` 顶部：

```js
const BALANCE_REFRESH_MS = 60_000;       // 正常刷新间隔
const BALANCE_MAX_BACKOFF_MS = 300_000;  // 连续失败后的最大退避
```

- 只在页面可见时刷新，切到后台暂停；
- 失败会退避（60s → 120s → 240s → 300s），成功后恢复 60s；
- 点击余额那一行会立即刷新并重置退避；
- 不建议改到 30 秒以下：余额接口是账号接口，不适合高频轮询。

### 5. 改提醒阈值 / 隐私默认值

`client.js` 顶部：

```js
const LOW_BALANCE_CNY = 3;        // 低于这个金额显示“余额不足”
```

隐私模式的状态保存在 localStorage 的 `dsh-greeting-bubble:privacy:v1`；想强制恢复“显示金额”，在控制台执行：

```js
localStorage.removeItem('dsh-greeting-bubble:privacy:v1')
```

### 6. 改成“只问候一次”（可选）

默认每次页面加载都会出现。如果希望用户关闭后永久不再出现，在组件里加一个 `localStorage` 开关，例如：

```js
function GreetingBubble({ t }) {
  const KEY = 'dsh-greeting-bubble:dismissed';
  const [dismissed, setDismissed] = React.useState(() => {
    try { return window.localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  if (dismissed) return null;
  const close = () => {
    try { window.localStorage.setItem(KEY, '1'); } catch {}
    setDismissed(true);
  };
  // …把 onClick: () => setDismissed(true) 换成 onClick: close
}
```

清除 `localStorage` 里这个键即可让问候重新出现。

### 7. 改图标、名称、描述

- 图标：`icon.svg`（36×36，纯几何、无文字）；
- 插件页显示的名称与说明：`locale/zh.json`、`locale/en.json` 的 `meta.title` / `meta.description`；
- 详情页大图：`docs/preview.svg`（由 `docs/DETAIL.md` 引用）。

## 工作原理（完整流程）

插件是一个 **DSH bundle（组合包）**，由一个 Host 插件行 + 一个浏览器端模块组成。整条链路如下：

```text
package.json
 ├─ dsh.bundle.patch → cordis.patch.yml   往 profile 的 Loader 插入一行插件
 └─ dsh.client       → ./client.js        声明浏览器半（platform: web）

安装（插件页 / plugin_manager）
   → pnpm 把包装进 profile，并在 dsh.profile.bundles 里选中该 bundle
   → Loader 挂载插件行：index.js 的 apply()（空实现，Host 端零开销）
   → Host 的 client-modules 扫描已启用条目，把 ./client 变成 /plugins 下的浏览器模块
   → 浏览器模块表执行 window.__ModuleLoader__.load({ id, factory })
   → factory(require) 取出 react，返回 Cordis 插件 { inject, apply }
   → apply():
        ctx.effect(() => ctx.locale.register(NS, { zh, en }))      // 注册文案
        ctx.slots.inject('shell.overlay', () =>                    // 等浮层槽出现
          ctx.slots.register({ name: 'shell.overlay', id, order, locale }, GreetingBubble))
   → 浮层渲染气泡；点 × → 组件内 useState → 返回 null
   → 停用/卸载 → Loader 行移除 → slots 注册被 dispose → 气泡消失
```

几个关键设计点：

1. **渲染位置选 `shell.overlay`**：这是 `@deepseek-ai/dsh-client-ui-layout` 声明的整帧浮层（`position: absolute; inset: 0; z-index: 20; pointer-events: none`），位于所有列之上、列滚动容器之外，适合徽标、Toast、状态胶囊这类覆盖层。注册时用一个新 `id`（`greeting-bubble`）就是**追加**一条，不会替换自带的条目。
2. **浮层穿透、气泡可交互**：浮层本身 `pointer-events: none`，它的直接子元素默认 `auto`。插件根节点设为 `none`；气泡卡片设回 `auto`——它必须接收指针事件才能拖动。因此只有气泡这一块会接住点击，浮层的其余区域完全穿透。
3. **拖动实现**：`pointerdown` 时记录起始坐标与气泡矩形并 `setPointerCapture`，`pointermove` 按位移计算新坐标、限制在可视区内，`pointerup` 保存到 `localStorage` 并释放捕获；窗口缩放时也会把气泡夹回屏幕内（`ResizeObserver` 不需要，监听 `resize` 即可）。
4. **高度避让**：默认距底 `84px`，位于输入卡发送按钮（34px 圆钮）之上；发送按钮始终露出来，不被问候语遮挡。拖动后以用户选择为准。
5. **生命周期归 Cordis 管**：所有注册都放在 `ctx.effect` / `ctx.slots.inject` 里。`slots.inject` 会在槽声明存在时注册、声明消失时注销；插件停用或卸载时整个 fiber 被销毁，气泡和字典一起被清理，不需要手写 DOM 清理。
6. **工厂无副作用**：`client.js` 顶层只调用 `__ModuleLoader__.load`，真正的注册发生在 `apply()`；模块体不碰 DOM、不开定时器。
7. **样式走主题变量**：气泡用 `--dsw-alias-bg-layer-3`、`--dsw-alias-border-l3`、`--dsw-alias-label-primary`、`--dsw-alias-interactive-bg-hover` 等 token，亮/暗主题自动切换；组件内的 `<style>` 随组件卸载一起移除。
8. **文案走 locale**：`locale: NS` 让框架把 `t` 注入组件，切换界面语言时文案实时更新，无需重载。
9. **Host 端为空**：`index.js` 只导出 `export function apply() {}`。插件不注册工具、不发请求、不写会话日志，因此对模型和会话完全透明。
10. **余额走账号 Remote**：`ctx.remote.account.getBalance(...)` 由 Host 用本地登录凭据请求 Platform，浏览器只拿到脱敏后的钱包金额；账号令牌永远不进浏览器。未登录（返回 null）或请求失败时显示 `--`。

## 文件结构

```text
dsh-plugin-greeting-bubble/
├─ package.json          # 包清单：bundle patch + dsh.client + 导出/打包清单
├─ index.js              # Host 半：空 apply()
├─ client.js             # 浏览器半：React 气泡 + slot 注册 + 文案
├─ cordis.patch.yml      # 往 Loader 插入 id 为 greeting-bubble 的插件行
├─ icon.svg              # 插件图标（36×36，原创几何图形）
├─ locale/
│  ├─ zh.json            # 插件页中文标题/描述/详情文档路径
│  └─ en.json            # 英文标题/描述/详情文档路径
├─ docs/
│  ├─ DETAIL.md          # 英文详情页文档（只含一张特性图）
│  ├─ DETAIL.zh.md       # 中文详情页文档（同一张图，中文替代文本）
│  ├─ DEV.md             # 维护者开发/发布/排错指南
│  └─ preview.svg        # 特性图（640×300，无文字）
├─ test/
│  └─ smoke.mjs          # 离线冒烟测试（不随包发布）
├─ UPLOAD.md             # 上传到 GitHub 的逐步说明（维护者用）
├─ README.md
├─ LICENSE
└─ .gitignore
```

## 本地开发与测试

维护者请先看 **[docs/DEV.md](docs/DEV.md)**：里面记录了完整的开发、测试、Git 与 npm 发布流程，以及我们实际踩过的坑（模块缓存、安装残留、2FA、观察期、GitHub DNS 等）。

```powershell
# 1. 语法检查（需要 Node.js 18+）
node --check index.js
node --check client.js

# 2. 离线冒烟测试：用假的 window/React/Cordis 上下文执行 client.js，
#    校验模块 id、注册参数、字典内容，并渲染一次组件
node test/smoke.mjs
```

开发循环：

1. 修改 `client.js` 等文件；
2. 让 DSH 重新加载该插件（插件页关闭再打开开关，或重启 DSH）；
3. 刷新页面查看效果。安装后的包被替换时，DSH 需要重启才能加载新的 JavaScript 模块代。

排查“气泡没出现”：

- 插件页确认 bundle 已安装且开关为开；
- 打开浏览器开发者工具控制台，搜索 `slot entry crashed`（如果组件抛错，会记录在这里）；
- 确认 DSH 版本包含 `shell.overlay` 槽（0.2.x 起）；
- 确认界面语言/主题没有影响（气泡应始终显示，直到点 ×）。

## 兼容性与限制

- 面向 **DSH Web 客户端**（`dsh.client.platform: web`）：桌面版窗口和浏览器版都适用；CLI / headless 模式没有界面，插件不产生任何效果。
- 依赖 `shell.overlay` 槽；更老的 DSH 版本没有该槽时，插件会安静地不显示，不会报错。
- 每次页面加载都会出现一次，不记忆关闭状态（如需记忆见[自定义](#自定义)）。
- 浮层位于整帧之上：气泡默认在右下角、输入框上方（距右 20px、距底 84px），可以拖到任意位置；拖动后位置记在 localStorage 里（`dsh-greeting-bubble:position:v1`）。气泡本体需要接收拖动事件，所以它所在的那一小块会接住点击，其余区域不受影响。
- 余额需要当前**已登录 DeepSeek 账号**；未登录、账号插件未启用或请求失败时显示 `余额 --`，不会报错。余额是 Platform 的实时钱包数据（充值 + 赠送），不是本地估算。
- 余额只显示在气泡里，不发送给任何第三方；但截图/录屏会带出金额，注意场合。
- 问候语固定为中文，在任何界面语言下都不翻译；只有按钮提示文字跟随语言。
- 插件自身不直接联网；余额读取经 Host 的账号服务完成。

## English

A tiny DeepSeek Harness Web UI plugin that shows a “你好，腾盛” speech bubble near the bottom-right corner after the page loads, with the signed-in account balance on a second line. Click × to dismiss it; it returns on the next page load. The bubble can be dragged anywhere, and its position is remembered in localStorage.

- Install: **Plugins → Add plugin** → `dsh-plugin-greeting-bubble` (npm), or `https://github.com/liwei169/dsh-plugin-greeting-bubble` (GitHub).
- It registers one entry into the frame-wide `shell.overlay` slot, uses `--dsw-alias-*` theme tokens, localizes its labels, and keeps every registration inside `ctx.effect` / `ctx.slots.inject` so disabling the bundle removes the bubble again.
- Dragging uses pointer capture, clamps to the viewport, and saves the dropped position under `dsh-greeting-bubble:position:v1`.
- Balance comes from `ctx.remote.account.getBalance(...)` (Host-side Platform call with the stored credential; the browser never sees the account token), refreshed every 60 seconds while the page is visible and on click, with backoff on failure.
- No direct network access, no data collection, no model-facing behavior.

Tested with DeepSeek Harness 0.2.2-rc.5.

## License

[MIT](LICENSE) © 2026 腾盛
