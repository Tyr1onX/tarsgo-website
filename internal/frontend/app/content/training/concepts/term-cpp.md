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

## 类型告诉编译器什么

C++ 是静态类型语言。变量声明通常包含类型，例如：

```cpp
int speed = 86;
double target = 100.0;
```

`int` 用于整数，`double` 用于浮点数。类型帮助编译器理解数据如何存储、进行哪些操作。

## 为什么需要 vector

当程序需要保存一组检测结果时，`std::vector` 提供可变长度的顺序容器。相比为每一个数据起一个变量名，容器可以用循环统一处理。

```cpp
#include <vector>
std::vector<int> speeds{86, 95, 100};
for (int value : speeds) {
    // value 是本次循环读取到的元素副本
}
```

## 引用和拷贝有什么区别

假设一个函数只需要读取很多检测结果。将整个容器按值传入，通常会产生一个副本；使用 `const std::vector<int>&` 可以通过只读引用访问原容器，减少无谓复制。

```cpp
double average(const std::vector<int>& values) {
    int total = 0;
    for (int value : values) total += value;
    return static_cast<double>(total) / values.size();
}
```

这个函数假设容器里至少有一个元素。代码设计时应明确输入条件，否则空容器会导致除零问题。

## 结构体与类怎样组织程序

结构体可以把相关字段放在一起；类还可以把操作数据的函数一起组织。模板让代码适用于不同类型，Lambda 用于书写短小的函数对象。它们都服务于让数据与行为之间的关系清晰，而不只是增加语法复杂度。
