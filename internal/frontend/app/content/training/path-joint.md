# AI 与视觉联合基础：从电脑到第一个能运行的项目

学习机器人软件之前，先做出一个可以交给别人运行的小项目：在电脑上准备文件，使用 Git 保存版本，进入 Ubuntu 开发环境，再分别用 Python 和 C++ 处理同一组数据。完成这件事，后续的视觉识别和导航程序才有共同的工作基础。

这条学习顺序来自[AI 与视觉联合培训原文](?group=joint)：计算机通识 → Git 与 GitHub → Ubuntu → Python → C++。下面五课始终沿用同一个 `tarsgo-practice` 文件夹，让每一项知识为下一项做准备。

## 第一课：认识自己的开发环境

你拿到一份程序时，首先要能回答：文件在哪里、系统是什么、程序由什么工具运行。CPU 执行指令，内存保存运行过程中的数据，磁盘保存文件，操作系统协调硬件和软件。先完成[计算机基础](?doc=computer)中的配置查看和文件整理练习。

在自己的「文档」目录中建立 `tarsgo-practice`，里面放 `notes.txt` 和 `data` 文件夹。`notes.txt` 写入操作系统、CPU、内存、存储位置和当前使用的编辑器。现在你已经可以给同学一份明确的环境说明。

**检查：** 从文件管理器找到练习目录，解释文件路径、内存容量和磁盘容量分别指什么；打开 `notes.txt` 核对记录。下一课就从这里开始保存版本。

## 第二课：让修改有迹可循

练习项目还会不断变化。为了知道哪个版本可以运行、什么时候改过文件，我们需要[Git 与 GitHub](?doc=git)。Git 负责本地版本记录，GitHub 提供远程存储与协作入口。

按照 Git 教程建立练习仓库，给 `README.md` 写一段项目说明并完成第一次提交。随后加入一句“下一步用程序读取转速数据”，再次提交，运行：

```bash
git status
git log --oneline -2
```

从最近两条记录找出修改前后版本，再推送到自己的 GitHub 仓库。此时仓库里有说明、有历史、也有可分享的地址。

**检查：** 能指出本地文件修改、暂存、提交与推送各发生在哪一环；另一个人能从 README 知道项目用途。

## 第三课：使用 Ubuntu 与终端

AI 与视觉方向会接触 Linux 环境，原文要求使用 Ubuntu、了解常用命令和文件权限。请先读[Ubuntu、终端与文件权限](?doc=term-linux)，再在组内使用的 Ubuntu 环境里完成下面的操作：

```bash
mkdir -p ~/tarsgo-practice/data
cd ~/tarsgo-practice
pwd
ls -la
```

`mkdir` 创建目录，`cd` 切换位置，`pwd` 显示当前路径，`ls` 查看文件。随后在 `data` 中创建文本文件，用 `cp` 复制、`mv` 重命名，再通过 `ls -l` 查看文件权限。每个命令都对应一项真实的文件操作，所以你能马上判断结果。

再观察一下环境差异：同一份项目在不同电脑上，工具版本和依赖可能不同。记录系统版本、运行命令和错误信息，是日后排查问题的起点。

原路线视频：[Ubuntu 1](https://www.bilibili.com/video/BV1cq421w72c)、[Ubuntu 2](https://www.bilibili.com/video/BV1Cc41127B9)。

**检查：** 能在终端找到练习文件，说明绝对路径与相对路径的区别，并能准确复述一次操作的命令和结果。

## 第四课：用 Python 解决一个小问题

现在给 `data/speeds.txt` 写入四行数字：`98`、`102`、`105`、`95`。假设它们是一次测试采集的转速，目标是算出平均值。数据有了明确来源，程序也就有了要解决的问题。

创建 `average.py`：

```python
from pathlib import Path

lines = Path('data/speeds.txt').read_text().splitlines()
values = [float(line) for line in lines]
mean = sum(values) / len(values)
print(f'平均转速：{mean:.1f} rpm')
```

运行 `python3 average.py`，预期结果是 `平均转速：100.0 rpm`。这里用到了文件读取、列表、类型转换和格式化输出。继续把平均值计算封装进一个函数，再测试数据为空、出现无效字符时程序会怎样响应。有关列表、函数和类的概念，可阅读[Python 概念详解](?doc=term-python)。

**检查：** 换一组数字仍能算对；程序出错时能定位数据文件与代码行，并把可运行版本提交到 Git。

原路线视频：[Python](https://www.bilibili.com/video/BV1rpWjevEip)。

## 第五课：把同一个问题交给 C++

接下来学习 C++，继续处理刚才的转速数据，这样可以把注意力集中在语言和程序结构上。先用 `std::vector<double>` 保存数字，编写函数求平均值，再把每次测量的转速和时间戳放进一个结构体。

```cpp
#include <iostream>
#include <vector>
double average(const std::vector<double>& values) {
    double total = 0;
    for (double value : values) total += value;
    return total / values.size();
}
int main() {
    std::vector<double> speeds{98, 102, 105, 95};
    std::cout << average(speeds) << '\n';
}
```

编译运行后，解释 `vector` 为什么适合存放一组数据，函数参数里的 `const &` 表达了怎样的访问方式。由此再进入[指针、引用、类与 STL](?doc=term-cpp)，逐渐学习模板、继承和多态。

原路线视频：[C++](https://www.bilibili.com/video/BV1Dk4y1j7oj)。

**检查：** 能编译运行多函数程序，说明参数如何传递，并将 Python 与 C++ 两个版本保存在同一个 Git 仓库。

## 五课合起来得到什么

现在你应拥有项目说明、文件目录、输入数据、两份程序与提交记录。它们组合起来，已经是一份可以交接的小项目。遇到术语可以随时点开对应概念页，再返回当前课程继续。

接下来进入[视觉方向](?doc=path-vision)或[AI 方向](?doc=path-ai)；遇到实际调试任务，参考[工程验证与可复现记录](?doc=term-engineering)。原文中的时间节点和阶段考核见[联合培训原始路线](?group=joint)。
