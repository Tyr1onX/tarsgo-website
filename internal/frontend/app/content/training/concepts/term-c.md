# C 语言里的指针、结构体与位运算
电控程序需要处理设备状态、传感器数据和控制命令。C 语言中的这三项能力，正好解决“数据放在哪里、怎样组织、怎样读写”的问题。
## 从一条电机反馈认识结构体
一条反馈包含转速、温度和状态。用结构体可以把它们放在一起：
```c
typedef struct {
    int speed_rpm;
    int temperature_c;
    unsigned char flags;
} MotorFeedback;
MotorFeedback feedback = {120, 35, 0x01};
```
其中 `speed_rpm` 表示每分钟转数。`feedback.flags & 0x01` 用于检查最低位是否置位：这是一种位掩码操作，常见于状态寄存器。
## 指针到底指向什么
变量保存值，指针保存变量所在的内存地址。例如 `MotorFeedback *p = &feedback;`，之后 `p->speed_rpm` 访问的是同一份反馈数据。传递指针时，要先确认它指向的对象仍然有效。
数组越界、未初始化指针和访问已经失效的对象，都可能让程序表现异常。调试时从输入数据、内存地址与变量生命周期逐步检查。
## 自己验证
编写函数 `void update(MotorFeedback *p, int speed)` 修改转速，再输出更新前后的值。解释传入指针为什么可以修改原结构体。
继续阅读 [电控学习路径](?doc=path-electrical)。
