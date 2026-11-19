# AI 与视觉联合基础：从电脑到第一个能运行的项目

机器人软件开发依赖操作系统、文件管理、版本控制与编程语言。一个包含数据文件、Python 和 C++ 程序的项目，可以用于说明这些工具之间的关系。

## 硬件、操作系统与文件结构

程序运行环境包括文件位置、操作系统、处理器架构与软件依赖。CPU 执行指令，内存保存运行数据，存储设备保存文件，操作系统负责协调资源。相关定义见[计算机基础](?doc=computer)。

在自己的「文档」目录中建立 `tarsgo-practice`，里面放 `notes.txt` 和 `data` 文件夹。`notes.txt` 写入操作系统、CPU、内存、存储位置和当前使用的编辑器。这些信息用于描述运行环境。

## Git 版本记录与仓库

练习项目还会不断变化。为了知道哪个版本可以运行、什么时候改过文件，我们需要[Git 与 GitHub](?doc=git)。Git 负责本地版本记录，GitHub 提供远程存储与协作入口。

按照 Git 教程建立练习仓库，给 `README.md` 写一段项目说明并完成第一次提交。随后加入一句“下一步用程序读取转速数据”，再次提交，运行：

```bash
git status
git log --oneline -2
```

从最近两条记录找出修改前后版本，再推送到自己的 GitHub 仓库。此时仓库里有说明、有历史、也有可分享的地址。

## Ubuntu 与终端命令

Ubuntu 是常见的 Linux 发行版；[终端命令与文件权限](?doc=term-linux)用于管理路径、文件及程序运行环境。以下命令创建并检查目录：

```bash
mkdir -p ~/tarsgo-practice/data
cd ~/tarsgo-practice
pwd
ls -la
```

`mkdir` 创建目录，`cd` 切换位置，`pwd` 显示当前路径，`ls` 查看文件。随后在 `data` 中创建文本文件，用 `cp` 复制、`mv` 重命名，再通过 `ls -l` 查看文件权限。每条命令均对应具体的文件系统操作。

再观察一下环境差异：同一份项目在不同电脑上，工具版本和依赖可能不同。记录系统版本、运行命令和错误信息，是日后排查问题的起点。

## Python 文件处理与函数

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

## C++ 容器与函数

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
