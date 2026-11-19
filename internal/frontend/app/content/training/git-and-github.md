# Git 与 GitHub：版本管理与远程协作

## 为什么保存文件还需要版本记录

假设正在修改一个代码文件。星期一它可以运行，星期二增加新功能后出现错误。你可能想知道：**星期二到底改了哪几行？能否找到星期一的版本？**

手工复制成 `代码-最终版`、`代码-最终版2`，很快就会分不清版本。Git 的作用是把文件的修改组织成一条有记录的历史：每次提交都能指出当时记录了哪些内容，方便比较和协作。

**Git 是版本控制工具；GitHub 是可以在网上托管 Git 仓库、进行代码协作的网站。** 本地运行 Git 不需要先把代码上传到 GitHub。

## 一个文件怎样成为一次提交

Git 中有四个位置。可以把它们理解为“正在写的草稿”“准备保存的改动”“已经保存的版本”和“共享到网上的版本”。

| 名称 | 含义 | 例子 |
| --- | --- | --- |
| 工作区 | 你正在编辑的项目文件 | 修改 `README.md` 里的文字 |
| 暂存区 | 准备放进下一次提交的修改 | 选择这次只提交 `README.md` |
| 本地仓库 | 已经保存的提交和历史 | 查看昨天的提交记录 |
| 远程仓库 | 在其他服务器上的 Git 仓库 | GitHub 上的项目仓库 |

![Git 工作区、暂存区、本地仓库与 GitHub 远程仓库的关系示意](/assets/images/training/git-workflow.svg)

它们按下面的顺序联系起来：

```text
编辑文件（工作区）
      ↓ git add
选择要记录的修改（暂存区）
      ↓ git commit
生成本地版本（本地仓库）
      ↓ git push
同步到 GitHub（远程仓库）
```

**提交与上传是两件事。** `git commit` 即使没有网络也能在本地完成；`git push` 需要与远程仓库通信。

## 安装 Git 与查看版本

Git 可从 [Git 官方下载页](https://git-scm.com/downloads) 获取。Windows 可以使用 Git Bash，macOS 和 Linux 可以使用终端。

```bash
git --version
```

例如输出 `git version 2.x.x`，表示 Git 已经可在终端中调用。版本号因实际安装而不同。

提交中会记录作者信息。第一次使用时可以配置：

```bash
git config --global user.name "提交者姓名"
git config --global user.email "email@example.com"
git config --global --list
```

`--global` 表示为当前用户设置默认值；最后一条命令用于查看配置。这里记录的是提交的作者信息，并非 GitHub 的登录密码。与 GitHub 账号关联时，可以使用账号验证过的邮箱或 GitHub 提供的隐私邮箱。

## 创建一个最小仓库

先创建一个空文件夹 `git-practice`，在终端进入这个文件夹。

```bash
git init -b main
git status
```

`git init` 在当前目录初始化 Git 仓库，`-b main` 指定初始分支名为 `main`。**仓库**就是由 Git 管理版本历史的项目目录。

现在创建一个 `README.md` 文件，内容如下：

```markdown
# 示例项目

这是一个记录文字与代码的项目。
```

在终端执行：

```bash
git status
```

Git 会把这个新文件标为尚未跟踪，因为它还没有进入任何提交。

### 暂存文件

```bash
git add README.md
git status
```

此时，`README.md` 的当前内容已经进入**暂存区**。它只是被选入“下一次提交准备记录的内容”，还没有形成正式的提交。

把选择动作分成这一步，是为了允许一次修改很多文件，却只把其中相关的文件放入某次提交。

### 创建提交

```bash
git commit -m "docs: add first README"
git log --oneline -1
git status
```

`git commit` 根据暂存区内容生成本地提交。`-m` 后面是这次提交的说明；`git log --oneline -1` 显示最近一条提交的短编号和说明。

例如历史可能显示：

```text
a1b2c3d docs: add first README
```

这里的 `a1b2c3d` 是示意编号，每个人实际生成的提交编号不同。提交记录可以帮助确认版本的先后顺序与修改内容。

## 亲眼看到一次修改前后的区别

把 `README.md` 末尾改成：

```markdown
# 示例项目

这是一个记录文字与代码的项目。

现在增加了一行项目说明。
```

运行：

```bash
git diff
```

Git 会用差异形式显示文件变化。通常以 `+` 开头的行表示新增，以 `-` 开头的行表示删除。

确认更改后再提交一次：

```bash
git add README.md
git commit -m "docs: expand project description"
git log --oneline -2
```

现在可以看到两条记录。**版本历史记录的是文件在不同提交时的状态，而不是一份份靠文件名区分的副本。**

如果需要比较已暂存但尚未提交的修改，使用 `git diff --cached`。普通的 `git diff` 默认显示工作区中尚未暂存的更改。

## GitHub 怎样与本地仓库连接

前面的两个提交都只存在于本机。GitHub 可以提供远程仓库，方便不同电脑同步或让其他人协作。

登录 [GitHub](https://github.com/)，通过 **New repository** 建立一个名为 `git-practice` 的空仓库。创建时保持为空，便于直接连接到刚建立的本地历史。

复制仓库的 HTTPS 地址，示例格式为：

```text
https://github.com/OWNER/git-practice.git
```

其中 `OWNER` 是仓库所有者，应换成实际用户名或组织名。然后在本地仓库执行：

```bash
git remote add origin https://github.com/OWNER/git-practice.git
git remote -v
git push -u origin main
```

这三个操作的职责不同：

- `git remote add origin ...`：给远程地址起名 `origin`。
- `git remote -v`：查看本地记录的远程地址是否正确。
- `git push -u origin main`：把本地 `main` 分支的提交推送至远程，并关联上游分支。

第一次推送时可能需要登录授权。GitHub 的 HTTPS Git 操作通常通过受支持的令牌或凭据管理器认证；提交作者邮箱与认证凭据是两种不同信息。

刷新 GitHub 仓库页面后，文件列表里应出现 `README.md`，提交历史也应显示刚才的两次提交。这时本地提交才真正同步到远程。

## 分支与协作

一个仓库可以有多个**分支**。分支名指向某条提交历史的当前末端，常用于在不同工作线上分别开发功能。

例如，一项新功能可以在独立分支上修改，确认正确后再通过 Pull Request（拉取请求，简称 PR）提交评审，最后合并到主分支。PR 是协作和审查的过程，不是 Git 提交的另一种名称。

本地修改、提交、推送与合并四个动作各有独立状态。**推送成功只表示远程仓库收到了提交，并不表示代码已经合并或部署到网站。**

## 常见问题

### `Author identity unknown`

Git 尚未获得提交作者的姓名或邮箱。使用 `git config --global user.name` 和 `git config --global user.email` 查看或设置，然后重新提交。

### `remote origin already exists`

当前仓库已经有名为 `origin` 的远程。先运行 `git remote -v` 查看；如果地址不正确，可使用 `git remote set-url origin 实际仓库地址` 更新。

### `src refspec main does not match any`

Git 无法找到要推送的本地引用。检查是否已经提交，并用 `git branch --show-current` 查看当前分支名称。

### 远程认证失败

远程地址、账户权限或登录方式可能不正确。对照 [GitHub 身份验证文档](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github) 检查认证方式。

Git 对仓库、分支和提交的详细定义可参阅 [Git 官方教材](https://git-scm.com/book/zh/v2)。
