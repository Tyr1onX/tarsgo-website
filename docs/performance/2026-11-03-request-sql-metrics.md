# 请求数据库观测

访问日志新增 sql_count、sql_elapsed、sql_errors。请求上下文携带独立、并发安全的计数器，GORM Trace 记录经过该上下文的操作。sql_elapsed 是 Trace 区间累计，包含 GORM/预加载时间且可能重叠，不能当作数据库 CPU、精确 SQL 执行时间或请求墙钟时间。连接池等待仍参考每分钟 DBStats。

不展开 SQL 回调、不输出参数或原始数据库错误消息，避免观测功能额外构造 SQL 和泄露正文、凭证。错误/慢操作仅输出类型/耗时；原有 handler 仍提供请求 ID 和操作名。RecordNotFound 不计入 sql_errors。脱离请求 context 的后台任务、原生 database/sql 调用、事务 BEGIN/COMMIT 不在请求 GORM 计数内；请求结束后才完成的异步操作不会补写已输出日志。此边界需在分析时保留。

测试覆盖并发更新、请求间隔离、不调用 SQL 字符串回调、错误脱敏，以及真实 Gin→GORM→mock SQL→访问日志的连接。没有前端/导航请求、资源或 schema 变化。本次新增基础观测，不预设查询次数预算或宣称性能改善。
