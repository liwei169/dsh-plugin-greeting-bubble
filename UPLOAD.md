# 上传到 GitHub（维护者步骤）

这份文件面向仓库维护者。普通用户只需要看 `README.md` 的「安装」一节。

下面所有命令都在 **PowerShell** 里执行，工作目录是插件根目录 `D:\插件实现`（换成你的实际路径）。
把 `liwei169` 换成真实的 GitHub 用户名（全小写，例如 `tengsheng`）。

---

## 0. 上传前：替换占位符

仓库里有两类占位符，上传前必须替换，否则别人点链接会 404：

| 文件 | 需要替换的内容 |
| --- | --- |
| `package.json` | `repository.url`、`homepage`、`bugs.url` 里的 `liwei169` |
| `README.md` | 安装方式一、方式二里的 `liwei169` |

快速检查还有没有漏掉的：

```powershell
Select-String -Path package.json,README.md -Pattern 'liwei169'
```

没有输出就说明替换完了。

> 如果暂时不确定仓库名：本说明统一使用 `dsh-plugin-greeting-bubble`，与 `package.json` 的 `name` 保持一致最省事（DSH 用包名定位插件）。

---

## 1. 准备一次（只需做一次）

### 1.1 安装 Git

- 下载：<https://git-scm.com/download/win>
- 安装时保持默认即可（会自带 Git Credential Manager，推送时可用浏览器登录 GitHub）。
- 验证：

  ```powershell
  git --version
  ```

### 1.2 配置提交身份（只需一次）

```powershell
git config --global user.name "你的名字"
git config --global user.email "你的GitHub邮箱"
```

### 1.3 准备认证方式（二选一）

**A. 浏览器登录（推荐，最省事）**

Git for Windows 在第一次 `git push` 时会弹出浏览器窗口，登录 GitHub 并授权即可，之后自动记住。

**B. 个人访问令牌 PAT（弹窗失败或使用命令行时）**

1. GitHub 右上角头像 → **Settings** → 左侧最下方 **Developer settings**；
2. **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**；
3. 勾选 `repo` 权限，生成后**立刻复制**（页面刷新后不再显示）；
4. 推送时：用户名填 GitHub 用户名，密码填这个 token。

> 不要把 token 写进任何文件、不要提交到仓库。仓库里没有 `.env` 之类的文件，`.gitignore` 已忽略依赖与日志。

---

## 2. 在 GitHub 上创建仓库

1. 打开 <https://github.com/new>；
2. **Repository name** 填 `dsh-plugin-greeting-bubble`；
3. 可见性选 **Public**（别人才能下载/安装）；
4. **不要**勾选 “Add a README file”、“Add .gitignore”、“Choose a license”——本地已经准备好了，勾选会造成冲突；
5. 点 **Create repository**。

创建后会看到一个空仓库页面，复制其中的 HTTPS 地址：

```
https://github.com/liwei169/dsh-plugin-greeting-bubble.git
```

---

## 3. 上传代码（推荐：Git 命令行）

```powershell
cd D:\插件实现

# 初始化本地仓库，主分支命名为 main
git init
git branch -M main

# 先确认没有把不该提交的东西加进来（只应看到插件源码、文档、图标等）
git status

git add .
git commit -m "feat: greeting bubble plugin for DeepSeek Harness"

# 关联远程仓库（把地址换成你自己的）
git remote add origin https://github.com/liwei169/dsh-plugin-greeting-bubble.git

# 首次推送并建立跟踪关系
git push -u origin main
```

推送成功后，刷新 GitHub 仓库页面，应能看到 `package.json`、`client.js`、`README.md` 等文件。

### 如果仓库创建时勾选了 README（产生了首个提交）

```powershell
git pull origin main --rebase
git push -u origin main
```

### 如果提示 `remote origin already exists`

```powershell
git remote set-url origin https://github.com/liwei169/dsh-plugin-greeting-bubble.git
```

---

## 4. 上传代码（备选：网页拖拽，无需 Git）

适合只想快速发布一次、以后再用命令行维护的情况。

1. 打开刚创建的仓库页面，点 **Add file → Upload files**；
2. 打开资源管理器进入 `D:\插件实现`，**全选里面的文件和文件夹**（`package.json`、`index.js`、`client.js`、`cordis.patch.yml`、`icon.svg`、`locale`、`docs`、`test`、`README.md`、`LICENSE`、`.gitignore`、`UPLOAD.md`），拖进网页；
   - 注意：不要把 `node_modules`、`.git` 拖进去；`_dev`、`.acl-repair` 等临时目录也不应存在（发布前已清理）。
3. 下方 **Commit changes** 填一句说明（例如 `feat: initial release`），点提交。

> 网页上传无法保留空目录，也不需要；对插件没有影响。

---

## 5. 打一个版本标签 / 发布 Release（可选，但推荐）

```powershell
git tag v1.0.0
git push origin v1.0.0
```

然后 GitHub 仓库页 → 右侧 **Releases** → **Draft a new release** → 选择 `v1.0.0` → 标题写 `v1.0.0`，说明写“首个版本：右下角「你好，腾盛」问候气泡” → **Publish release**。

这样别人在仓库首页能直接看到版本和下载入口。

---

## 6. 验证“别人能装”（强烈建议）

你本机现在装的是**本地目录软链接**（`link:D:\插件实现`）。要确认 GitHub 安装路径真的可用：

1. DSH 的 **插件** 页找到 **Greeting bubble** → **卸载**（这会移除本地 link，不影响本地文件）；
2. 点 **添加插件**，填入：

   ```
   https://github.com/liwei169/dsh-plugin-greeting-bubble
   ```

3. 点 **安装**，应能成功下载并自动启用；刷新页面，右下角出现气泡。

如果失败，先看安装日志里的 pnpm 输出（插件页安装详情会显示），常见原因是仓库地址写错、仓库不是 Public、或 `package.json` 的 `name` 与仓库内容不匹配。

---

## 7. 以后如何更新

1. 修改代码，并把 `package.json` 的 `version` 加一（例如 `1.0.1`）；
2. 重新跑一遍测试：

   ```powershell
   node --check index.js
   node --check client.js
   node test/smoke.mjs
   ```

3. 提交并推送：

   ```powershell
   git add .
   git commit -m "fix: ..."
   git push
   git tag v1.0.1
   git push origin v1.0.1
   ```

4. 通知使用者：在 **插件** 页卸载旧版后重新安装 GitHub 地址（Git 安装的插件不能像 npm 包那样一键升级，除非固定到具体 commit 并使用更新功能）。

---

## 8. 可选：发布到 npm

如果希望别人在插件页直接填包名（`dsh-plugin-greeting-bubble`）安装：

1. 把 `package.json` 里的 `"private": true` 删掉；
2. 登录并发布：

   ```powershell
   npm login
   npm publish
   ```

3. 检查 npm 页面上的文件列表：应包含 `index.js`、`client.js`、`cordis.patch.yml`、`locale/*.json`、`docs`、`icon.svg`（由 `files` 字段控制）。

> 发布 npm 后，仍然建议保留 GitHub Release，方便查看源码与变更。

---

## 9. 常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| `git push` 提示 `Authentication failed` | 用 PAT 作为密码；或删除 Windows 凭据管理器中旧的 GitHub 凭据后重试 `git push` |
| `src refspec main does not match any` | 还没有提交：先 `git add .` + `git commit` |
| 提示 `LF will be replaced by CRLF` | Windows 换行警告，不影响，直接继续 |
| 推上去的中文乱码 | 确保文件本身是 UTF-8；本仓库文件均为 UTF-8，用 VS Code / 记事本另存为 UTF-8 即可 |
| 安装时报 `not-a-package` / `not-bundle` | 仓库根目录必须有 `package.json`，且包含 `dsh.bundle.patch` 指向 `cordis.patch.yml` |
| 安装成功但气泡不出现 | 确认插件行已启用；刷新页面；检查浏览器控制台是否有 `slot entry crashed`；确认 DSH 版本包含 `shell.overlay` |
| 修改代码后界面没变化 | 安装后的包被替换时需要重启 DSH 才能加载新的模块代；开发时可先关闭再打开插件开关 |

---

## 10. 发布前自查清单

- [ ] `liwei169` 已全部替换；
- [ ] `node --check index.js`、`node --check client.js` 通过；
- [ ] `node test/smoke.mjs` 输出 `ok: ...`；
- [ ] `package.json` 的 `name` = `dsh-plugin-greeting-bubble`，`version` 已更新；
- [ ] `cordis.patch.yml` 里的 `name` 与包名一致；
- [ ] `locale/zh.json`、`locale/en.json` 的标题与描述准确；
- [ ] `icon.svg`、`docs/preview.svg` 能正常打开；
- [ ] 仓库为 Public，根目录没有 `node_modules`、`.git` 之外的临时目录；
- [ ] 用 GitHub 地址在干净环境安装过一次并看到气泡。
