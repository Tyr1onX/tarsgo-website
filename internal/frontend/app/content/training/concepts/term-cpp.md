# C++：怎样组织长期维护的程序
C++ 在机器人软件中常用于对性能和系统接口有较高要求的模块。入门的重点是类型、对象生命周期和清晰的数据结构。
## 一个最小例子
```cpp
#include <iostream>
#include <vector>
struct Target { double x; double y; };
int main() {
    std::vector<Target> targets{{1.0, 2.0}, {3.0, 4.0}};
    for (const auto& item : targets) {
        std::cout << item.x << ", " << item.y << '\n';
    }
}
```
`struct` 组织数据，`vector` 是 STL 中的可变长度容器，`const auto&` 用只读引用访问已有元素，避免每次循环都复制一个对象。
## 进阶概念怎么衔接
指针与引用涉及对象访问；类封装状态与行为；模板让类型变化时仍能复用逻辑；Lambda 可以把短小的处理函数放在使用处。每一步都应结合代码和编译结果理解。
## 自己验证
增加 `confidence` 字段，用函数筛选置信度高于阈值的目标；说明参数按值传递和按引用传递的不同。
回到 [联合基础学习路径](?doc=path-joint) 或 [视觉学习路径](?doc=path-vision)。
