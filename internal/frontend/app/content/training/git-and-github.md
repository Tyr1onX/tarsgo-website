# 使用 Git 完成第一次代码提交

**适用方向：** AI、视觉（来自联合培训路线），电控（原文明确要求 Git 版本管理）；其他有代码协作需要的同学也可以学习。

**完成目标：** 在自己的电脑上创建 Git 仓库，完成一次提交，把这次提交推送到自己新建的 GitHub 仓库，并能在网页上查看结果。

> 建议使用个人练习仓库，不要直接在战队正式项目仓库操作。以下示例以现代 Git 版本为基础，Windows 可使用 Git Bash，macOS / Linux 使用终端。

## 1. 先理解四个位置

Git 记录文件变化；GitHub 用来托管仓库和开展协作。**本地提交并不等于上传到 GitHub**。

![Git 工作区、暂存区、本地仓库与 GitHub 远程仓库的关系示意](/assets/images/training/git-workflow.svg)

*示意图：修改文件后，使用 `git add` 暂存、`git commit` 生成本地提交、`git push` 上传到远程仓库。*

这三个命令分别解决三件事：挑选这次要提交的文件、记录一个本地版本、将本地版本共享到远端。

## 2. 安装 Git 并设置提交身份

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

## 3. 创建自己的练习仓库

在一个方便找到的位置创建空文件夹（如 `git-practice`），并在终端进入这个文件夹。接着运行：

```bash
git init -b main
git status
```

第一条初始化仓库并将初始分支设为 `main`；第二条查看仓库状态。此时尚未创建提交是正常的。

用编辑器在该文件夹中创建 `README.md`，输入：

```markdown
# 我的第一个 Git 仓库

这是我为 TARS GO 新人培训创建的练习文件。
```

保存后运行：

```bash
git status
git add README.md
git status
```

你会看到 `README.md` 从未跟踪文件变成准备提交的文件。这里明确使用 `git add README.md`，避免误把其他文件一起提交。

## 4. 提交并确认本地版本

```bash
git commit -m "docs: add first README"
git log --oneline -1
git status
```

检查结果：

- `git log --oneline -1` 显示一条带短提交编号和 `docs: add first README` 的记录；编号每个人都不同。
- `git status` 显示工作区没有待提交的变化（通常包含 `working tree clean`）。

这意味着你已经有一个**本地提交**，即使没有网络、没有 GitHub 账号，这一步仍可完成。

## 5. 把本地仓库连接到 GitHub

登录 [GitHub](https://github.com/)，通过 **New repository** 新建一个仓库，例如 `git-practice`。为了与已有本地提交直接连接，创建时**不要勾选自动创建 README、.gitignore 或 license**。

在新仓库页面复制 HTTPS 仓库地址。回到自己的练习文件夹，在下面的命令中用实际地址替换示例地址：

```bash
git remote add origin https://github.com/OWNER/git-practice.git
git remote -v
git push -u origin main
```

`OWNER` 需要替换成你的 GitHub 用户名，仓库名也必须与实际仓库一致。`git remote -v` 用于检查远程地址，`git push` 才会真正上传提交。

首次推送可能要求登录或授权。按照 Git 提供的浏览器/凭据管理器流程完成身份验证；**GitHub 不支持把账号登录密码直接当作 HTTPS Git 操作密码**，不要把密码或访问令牌写进代码和仓库。

## 6. 检查 GitHub 上的最终结果

在浏览器刷新刚创建的 GitHub 仓库页面，逐项核对：

- 能看到 `README.md`，并显示其中写入的文字。
- 仓库的提交历史出现 `docs: add first README`。
- 回到终端执行 `git status`，确认本地没有未提交的更改。

全部满足就完成了这篇教程，不需要额外上传截图或在网站打卡。

## 常见问题

### 提示 `Author identity unknown`

运行第二节中的 `git config --global user.name` 和 `git config --global user.email`，检查配置后重新提交。

### 提示 `remote origin already exists`

说明仓库已有名为 `origin` 的远程地址。先用 `git remote -v` 检查；如果地址不正确，可以用 `git remote set-url origin <实际仓库地址>` 更新，避免重复添加。

### 提示 `src refspec main does not match any`

先确认第四节的 `git commit` 已成功，并通过 `git branch --show-current` 查看分支名。没有提交或分支名不一致都可能导致推送失败。

### 推送时提示认证失败

先确认远程地址和账号权限，再按照 [GitHub 官方身份验证说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github) 选择受支持的登录方式。不要把密码、令牌或 SSH 私钥发给别人。

## 继续学习

原始 AI 与视觉联合培训路线推荐的视频：

- [Git 与 GitHub 视频 1（原文 BV1Y8aL6SEit）](https://www.bilibili.com/video/BV1Y8aL6SEit)
- [Git 与 GitHub 视频 2（原文 BV1LwHv6LEYz）](https://www.bilibili.com/video/BV1LwHv6LEYz)

其他参考资料：[Git 官方教程](https://git-scm.com/book/zh/v2) · [GitHub：管理远程仓库](https://docs.github.com/en/get-started/git-basics/managing-remote-repositories)。

如果已经能完成提交和推送，可以查看左侧「原始培养路线」中的对应组别，继续学习后续内容。
