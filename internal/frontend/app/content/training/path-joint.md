# AI 与视觉联合基础：一份数据如何变成程序结果

AI 和视觉程序经常要处理图片、传感器数值和机器人状态。它们看上去很复杂，但最小的程序也遵循相同过程：**找到输入的数据 → 按规则处理 → 得到输出**。

例如有四次电机转速测量：98、102、105、95。计算平均值会得到 100。为了把这个小计算变成可运行、可保存、可分享的程序，需要逐步理解电脑、文件、版本管理和编程语言之间的关系。

## 文件与程序从哪里来

计算机里，程序和数据通常都以文件的形式保存在存储设备中。程序运行时，操作系统读取相关文件，为程序分配内存和计算资源。

假设一个项目有下面这些文件：

```text
tarsgo-practice/
├── README.md
├── data/
│   └── speeds.txt
├── average.py
└── average.cpp
```

- `README.md` 是说明文档，记录项目用途。
- `data/speeds.txt` 保存输入数据。
- `average.py` 和 `average.cpp` 分别是 Python 和 C++ 源代码。

这四项文件承担不同职责，所以把它们放在一个目录中，既方便程序读取，也方便日后查找。路径是文件在文件系统中的位置，`data/speeds.txt` 表示从当前项目目录进入 `data`，再找到 `speeds.txt`。

若程序在另一个目录运行，相对路径 `data/speeds.txt` 可能指向错误的位置。这类问题属于文件路径问题，和计算算法本身没有关系。CPU、内存、文件与目录的基础定义见[计算机基础](?doc=computer)。

## 为什么要用 Git 保存变化

假设今天的 `average.py` 正常输出 100，明天修改后开始报错。仅保存最新文件，很难确定发生了哪些变化。Git 可以把每次修改保存为一个有编号的版本。

创建 `README.md` 后执行：

```bash
git init -b main
git add README.md
git commit -m "docs: describe practice project"
```

这三条命令分别创建仓库、选择准备记录的文件、保存一次本地提交。

当 `average.py` 增加计算代码后，再提交一次：

```bash
git add average.py
git commit -m "feat: calculate average speed"
git log --oneline -2
```

最后一条命令会显示最近两次提交。这样，“说明文档什么时候写的”和“计算程序什么时候加的”就有了记录。

**Git 和 GitHub 的区别**是：Git 管理本地版本；GitHub 托管远程仓库。在本地完成提交后，使用 `git push` 才会将提交同步到远程。四个位置的关系见[Git 与 GitHub](?doc=git)。

## Ubuntu 和终端解决什么问题

有时需要通过文字命令管理文件，而不是在文件管理器里点击。终端就是输入这些命令的界面；Ubuntu 是一种常用的 Linux 发行版。

在 Ubuntu 中执行：

```bash
mkdir -p ~/tarsgo-practice/data
cd ~/tarsgo-practice
pwd
ls
```

- `mkdir -p` 创建目录。
- `cd` 切换当前所在的目录。
- `pwd` 输出当前目录的完整路径。
- `ls` 列出目录中的内容。
- `~` 表示当前用户的主目录。

这些命令的结果会影响接下来程序到哪里找文件。例如在项目根目录运行 `python3 average.py` 时，程序用到的 `data/speeds.txt` 就相对于这里查找。

Linux 的文件权限、绝对路径与相对路径详见[Ubuntu 与终端](?doc=term-linux)。

## Python：让程序计算平均转速

先在 `data/speeds.txt` 中存放四行数字：

```text
98
102
105
95
```

一个最简单的 Python 版本可以直接把数字放在列表里：

```python
speeds = [98, 102, 105, 95]
total = sum(speeds)
average = total / len(speeds)
print(average)
```

`speeds` 是列表，用来放多个数值；`sum` 把数值相加；`len` 得到列表中有多少个元素。四个数相加是 400，除以 4 后输出 `100.0`。

如果数据保存在文件中，可以让程序先读文件：

```python
from pathlib import Path

text = Path("data/speeds.txt").read_text()
lines = text.splitlines()
speeds = [float(line) for line in lines]
print(sum(speeds) / len(speeds))
```

现在出现了几项新的概念：

- `Path` 表示文件路径。
- `read_text` 读取文本内容。
- `splitlines` 将文本按行拆开。
- `float` 把每一行的文字转换成数字。

程序**先读取文件，再转换类型，最后计算**。如果文件不存在，就在读取这一步报错；如果某一行不是数字，就在转换时出错。将问题分解后，排查会更容易。Python 的变量、函数、列表和字典详见[Python 入门](?doc=term-python)。

## C++：用另一种语言表达同一个计算

Python 代码可以直接运行；C++ 源代码通常要先经编译器转换为可执行程序。虽然使用方式不同，它们仍在解决同一件事。

```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<double> speeds{98, 102, 105, 95};
    double total = 0;
    for (double speed : speeds) {
        total += speed;
    }
    std::cout << total / speeds.size() << '\n';
}
```

这里：

- `double` 表示一种浮点数类型。
- `std::vector<double>` 保存一组 `double` 数值。
- `for` 遍历这组数，把每个值累加到 `total`。
- `std::cout` 将结果输出到终端。

程序在概念上与 Python 相同：存放数据、求和、计算平均值。随着程序增大，可以把计算封装为函数，再把一次测量的数值和时间戳组织为结构体。对应的类型、引用、容器与类见[C++ 入门](?doc=term-cpp)。

## 从一个小程序走向机器人软件

计算转速平均值是一个小功能，真实机器人软件会同时涉及数据采集、图像处理、状态估计和执行控制。每一段仍然有明确的输入、处理方法和输出。

| 基础知识 | 在机器人程序里的具体作用 |
| --- | --- |
| 文件与路径 | 找到配置、图片、数据集和日志 |
| Git | 记录代码版本与团队修改 |
| Ubuntu 与终端 | 启动程序、管理环境与查看日志 |
| Python | 编写数据处理和算法原型 |
| C++ | 编写具有明确类型和接口的机器人模块 |

视觉方向会进一步处理图像与检测结果；AI 方向则会处理定位和导航。两者共享的基础是可理解的数据流与可复现的运行环境。
