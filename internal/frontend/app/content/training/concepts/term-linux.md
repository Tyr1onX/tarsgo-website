# Ubuntu 与终端：认识开发环境
Linux 是操作系统内核，Ubuntu 是基于 Linux 的发行版。AI 与视觉项目常在 Ubuntu 环境中运行工具、编译程序和管理依赖。
## 常用终端命令
以下命令演示目录创建、路径切换和文件查看：
```bash
pwd
mkdir -p ~/tarsgo-practice/data
cd ~/tarsgo-practice
touch data/notes.txt
ls -l data
```
`pwd` 显示当前目录，`cd` 切换目录，`~` 代表当前用户主目录。`ls -l` 可以查看文件的部分权限信息。
## 绝对路径、相对路径与权限
以 `/home/user/work` 开头的是绝对路径；`data/notes.txt` 则相对于当前工作目录。读（r）、写（w）、执行（x）权限决定文件可以怎样使用，目录权限还会影响进入和列举。
## 环境为什么会影响程序运行
同一份代码在不同电脑上可能遇到依赖或版本差异。遇到问题时记录 Ubuntu 版本、工具版本、运行命令和错误信息，再对照项目文档定位。
