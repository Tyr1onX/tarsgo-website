# Git 与 GitHub：版本管理与远程协作

## 工作区、暂存区、本地仓库与远程仓库

Git 记录每次文件修改，GitHub 托管远程仓库。**`git commit` 保存本地版本，`git push` 把版本同步到 GitHub。**

![Git 工作区、暂存区、本地仓库与 GitHub 远程仓库的关系示意](/assets/images/training/git-workflow.svg)

*示意图：修改文件后，使用 `git add` 暂存、`git commit` 生成本地提交、`git push` 上传到远程仓库。*

工作区保存正在编辑的文件；暂存区保存下一次准备提交的更改；本地仓库保存提交历史；远程仓库用于同步和协作。

## Git 安装与提交身份

从 [Git 官方下载页](https://git-scm.com/downloads) 安装 Git。Windows 安装完成后可打开 Git Bash；macOS / Linux 在终端中操作。

运行下面的命令确认安装：

```bash
git --version
```

正常结果会显示 Git 版本，例如 `git version 2.x.x`，具体版本号因电脑而异。

首次使用时，配置自己希望显示在提交记录中的姓名、邮箱：

```bash
git config --global user.name "你的姓名"
git config --global user.email "你的邮箱@example.com"
git config --global --list
```

最后一条命令用于核对设置。若希望 GitHub 将提交关联到个人账号，可以使用 GitHub 账号已验证的邮箱或其提供的隐私邮箱。

## 初始化仓库与暂存文件

在一个方便找到的位置创建空文件夹（如 `git-practice`），并在终端进入这个文件夹。接着运行：

```bash
git init -b main
git status
```

第一条初始化仓库并将初始分支设为 `main`；第二条查看仓库状态。此时尚未创建提交是正常的。

用编辑器在该文件夹中创建 `README.md`，输入：

```markdown
# 我的第一个 Git 仓库

项目说明与使用方法。
```

保存后运行：

```bash
git status
git add README.md
git status
```

`README.md` 从未跟踪文件变为已暂存文件。`git add README.md` 只选择这一个文件的更改。

## 提交及历史记录

```bash
git commit -m "docs: add first README"
git log --oneline -1
git status
```

检查结果：

- `git log --oneline -1` 显示一条带短提交编号和 `docs: add first README` 的记录；编号每个人都不同。
- `git status` 显示工作区没有待提交的变化（通常包含 `working tree clean`）。

## 关联 GitHub 远程仓库

登录 [GitHub](https://github.com/)，通过 **New repository** 新建一个仓库，例如 `git-practice`。创建时选择**空仓库**，使远程仓库与前面建立的本地提交直接对应。

在新仓库页面复制 HTTPS 仓库地址。回到自己的练习文件夹，在下面的命令中用实际地址替换示例地址：

```bash
git remote add origin https://github.com/OWNER/git-practice.git
git remote -v
git push -u origin main
```

`OWNER` 需要替换成你的 GitHub 用户名，仓库名也必须与实际仓库一致。`git remote -v` 用于检查远程地址，`git push` 才会真正上传提交。

首次推送可能要求登录或授权。按照 Git 的浏览器登录或凭据管理器流程完成身份验证。GitHub HTTPS Git 操作采用受支持的令牌或凭据管理方式，凭据保存在系统凭据管理器中。

## 本地与远程状态核对

在浏览器刷新刚创建的 GitHub 仓库页面，逐项核对：

- 能看到 `README.md`，并显示其中写入的文字。
- 仓库的提交历史出现 `docs: add first README`。
- 回到终端执行 `git status`，确认本地没有未提交的更改。

## 常见问题

### 提示 `Author identity unknown`

运行第二节中的 `git config --global user.name` 和 `git config --global user.email`，检查配置后重新提交。

### 提示 `remote origin already exists`

说明仓库已有名为 `origin` 的远程地址。先用 `git remote -v` 检查；如果地址不正确，运行 `git remote set-url origin <实际仓库地址>` 更新。

### 提示 `src refspec main does not match any`

先确认第四节的 `git commit` 已成功，并通过 `git branch --show-current` 查看分支名。没有提交或分支名不一致都可能导致推送失败。

### 推送时提示认证失败

先确认远程地址和账号权限，再按照 [GitHub 官方身份验证说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github) 选择受支持的登录方式。确认凭据仅保存在自己的设备和受信任的凭据管理工具中。
