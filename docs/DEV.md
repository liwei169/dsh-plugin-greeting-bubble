# 开发与发布指南（维护者）

这份文档面向仓库维护者，记录本插件的本地开发、测试、Git 提交和 npm 发布流程，以及我们实际踩过的坑。普通用户请看 [README](../README.md)。

所有命令都在 **PowerShell** 中执行，工作目录为仓库根目录（本文以 `D:\插件实现` 为例）。

---

## 0. 环境说明

本机没有全局 `node`/`npm`，但 DSH 自带了一套 Node 和 pnpm，后面的命令统一用它们：

```powershell
$node = 'C:\Users\81292\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\81292\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'
```

> 路径里的用户名按实际情况替换；如果以后装了全局 Node，也可以直接用 `node` / `npm`。

---

## 1. 项目结构

```text
.
├─ package.json          # 包清单：dsh.bundle.patch + dsh.client + exports/files
├─ cordis.patch.yml      # 往 Loader 插入插件行（id: greeting-bubble）
├─ index.js              # Host 半（空 apply）
├─ client.js             # 浏览器半：气泡、拖动、余额、slot 注册
├─ icon.svg              # 插件图标
├─ locale/{zh,en}.json   # 插件页标题/描述
├─ docs/                 # 详情页文档 + 本文档
├─ test/smoke.mjs        # 离线冒烟测试
└─ README.md / LICENSE / UPLOAD.md
```

---

## 2. 本地开发

### 2.1 安装到 DSH（link 方式）

插件页 → **添加插件** → 填入仓库的**绝对路径**（例如 `D:\插件实现`）→ 安装。

也可以用 agent：

```text
安装 D:\插件实现 这个插件
```

### 2.2 修改代码后，按需要选择刷新级别

| 改动 | 生效方式 |
|---|---|
| 只改 `client.js` / 样式 / 文案 | 插件页**关闭再打开**开关 → 刷新页面 |
| 改 `package.json`、`cordis.patch.yml`、宿主逻辑 | 卸载后重装 → 刷新页面 |
| 换过安装路径、升级/降级版本、出现 `ENOENT` | **完全退出 DSH 再打开**（重启 Host 进程） |

> 页面刷新（Ctrl+R）只重载浏览器页面，**不会清 Host 进程的模块缓存**。

### 2.3 为什么必须重启：模块缓存与路径

DSH 的 Host 进程用 Node 的 ESM 加载插件。模块一旦被解析，结果会按“说明符 → 实际文件路径”缓存在进程里。

如果插件是 `link` 到某个目录、之后又**删除或移动了那个目录**，Host 缓存仍指向旧路径，于是报：

```
failed to import: ENOENT: no such file or directory, open '...\old-path\index.js'
```

**规则：**

- 开发目录放在固定位置，**不要删、不要临时复制到别处再安装**；
- 要移动/删除目录，先到插件页**卸载**插件；
- 不得已换了路径：重启 DSH。

另外，pnpm 替换 `node_modules` 里的链接目录时，Windows 上偶尔会报 `EPERM`（目录被占用）。这时先卸载，再清理残留（见 2.4），然后重装。

### 2.4 清理安装残留

```powershell
$nm = 'C:\Users\<用户名>\.dsh\profiles\desktop\node_modules'
Get-ChildItem $nm -Force | Where-Object { $_.Name -like '*greeting-bubble*' } | ForEach-Object {
  if ($_.LinkType -eq 'Junction') { cmd /c rmdir "$($_.FullName)" }   # 只删链接，不删目标
  else { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
}
```

> 只对名称包含 `greeting-bubble` 的项操作；不要动其他插件。

---

## 3. 测试

提交前至少跑：

```powershell
$node = 'C:\Users\81292\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'

node --check index.js
node --check client.js
node test/smoke.mjs          # 必须输出：ok: ...
```

冒烟测试用假的 `window / React / Cordis / Remote` 上下文执行 `client.js`，校验模块 id、slot 注册参数、字典、账号 Remote 注入和组件渲染。

检查 npm 会打包哪些文件：

```powershell
$pnpm = 'C:\Users\81292\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'
& $node $pnpm pack --dry-run
```

---

## 4. 版本与发布（npm）

### 4.1 版本号

遵循语义化版本：

- 修 bug：`1.2.1`
- 加功能：`1.3.0`
- 不兼容改动：`2.0.0`

npm **不允许重复发布同一个版本号**，每次发布前必须先改 `package.json` 的 `version`。

### 4.2 登录与令牌

发布需要 npm 账号并开启 2FA（安全密钥/生物识别）。发布令牌放在本机：

```
C:\Users\<用户名>\AppData\Local\pnpm\config\auth.ini
```

内容形如：

```
//registry.npmjs.org/:_authToken=npm_xxxxx
```

**令牌绝不提交到仓库**。令牌过期（或误删）后重新生成一个即可：

- npm → **Access Tokens** → **Generate New Token** → **Granular Access Token**
- 权限 **Read and write (publish and stage)**、范围 **All packages**、**Bypass 2FA** 打开

> 注意：2027 年 1 月起 npm 收紧“免 2FA 令牌”的直接发布，届时需改用带验证码/可信发布（CI）的方式。

### 4.3 发布

```powershell
cd D:\插件实现
$node = 'C:\Users\81292\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\81292\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'

# 先干跑
& $node $pnpm publish --dry-run --no-git-checks --access public

# 正式发布
& $node $pnpm publish --no-git-checks --access public

# 验证（registry 有 1~2 分钟处理延迟）
& $node $pnpm view dsh-plugin-greeting-bubble version
```

### 4.4 两个常见“不是失败”的现象

1. **`0.0.0-stage` 占位版本**：全新包第一次发布时，npm 先放一个占位版本，真版本 1~2 分钟后生效；不是错误，也不用审批。
2. **`minimumReleaseAge` 观察期**：pnpm 默认不自动安装刚发布不久的版本。按包名安装会拿到旧版本；想立即用新版：

   ```
   dsh-plugin-greeting-bubble@1.2.0
   ```

   安装时带上版本号，profile 会自动加入 `minimumReleaseAgeExclude` 白名单。

### 4.5 测试版（可选）

频繁试错时，用预发布版本代替 link 安装，避免路径缓存问题：

```powershell
# package.json 版本改成 1.2.1-beta.0 后
& $node $pnpm publish --no-git-checks --access public --tag beta
```

安装时填 `dsh-plugin-greeting-bubble@1.2.1-beta.0`；测试通过后再发正式版。

---

## 5. Git

### 5.1 提交与推送

```powershell
cd D:\插件实现
git add -A
git commit -m "feat: xxx (v1.3.0)"
git tag v1.3.0
git push
git push origin v1.3.0
```

远端：`https://github.com/liwei169/dsh-plugin-greeting-bubble.git`

推送会使用 Git Credential Manager 已保存的 GitHub 登录；也可以用 PAT（classic，`repo` 权限）作为密码。

### 5.2 GitHub 网络问题

本机到 `github.com` 的 DNS 偶尔会被解析到不可用 IP，表现为推送/安装超时。临时办法（机器级、可撤销）：

- 管理员编辑 `C:\Windows\System32\drivers\etc\hosts`，加一行

  ```
  20.205.243.166 github.com
  ```

- 执行 `ipconfig /flushdns`；
- 用完后删除该行即可。

长期方案：使用稳定的 DNS 或代理。

### 5.3 `.git` 管理文件丢失的应急恢复

如果 `git status` 报 `not a git repository`，但 `.git/objects`、`.git/refs` 还在：

```powershell
# 1) 重建 .git/HEAD，内容为：ref: refs/heads/main
# 2) 重建 .git/config，至少包含 core、remote.origin、branch.main
# 3) 从 refs 重建索引
git reset --mixed HEAD
git status -sb
```

历史不会丢；`git fsck` 可校验。

---

## 6. 发版 Checklist

- [ ] 改代码，`package.json` 版本号 +1
- [ ] `node --check index.js` / `node --check client.js` 通过
- [ ] `node test/smoke.mjs` 输出 `ok: ...`
- [ ] `pnpm pack --dry-run` 文件清单正确（12 个文件左右）
- [ ] `git add/commit/tag/push`（含 tag）
- [ ] `pnpm publish --no-git-checks --access public`
- [ ] `pnpm view dsh-plugin-greeting-bubble version` 确认新版本
- [ ] 插件页卸载旧版 → 安装 `dsh-plugin-greeting-bubble@新版本` → 重启 DSH
- [ ] 刷新页面，确认气泡、拖动、余额正常

---

## 7. 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 安装报 `EPERM ... rename` | `node_modules` 里有旧目录/链接残留：卸载后按 2.4 清理再装 |
| 加载报 `ENOENT ... old-path\index.js` | Host 缓存了已删除的安装路径：完全重启 DSH |
| 插件页显示“未运行”但文件都在 | 同上，多为路径缓存或导入失败，重启后仍失败就看安装日志 |
| 新版本装不上、装到旧版 | `minimumReleaseAge` 观察期：填 `包名@版本号` 安装 |
| 气泡没出现 | 插件页确认已启用；刷新；检查控制台 `slot entry crashed`；确认 DSH 版本含 `shell.overlay` |
| 余额显示 `--` | 未登录 DeepSeek 账号或账号服务不可用；确认设置里账号正常 |
| `pnpm publish` 报 403 需要 2FA | 令牌没有 Bypass 2FA：重新生成 Granular Token 并打开 Bypass 2FA |
| `pnpm publish` 报 401 | 令牌过期/被删：重新生成并写入 `auth.ini` |
| 推送/安装 GitHub 超时 | DNS 问题，见 5.2 |
