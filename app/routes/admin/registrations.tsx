import { useState } from "react";

export function meta() {
  return [
    { title: "报名列表 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 报名管理" },
  ];
}

const mockRegistrations = [
  { id: 1, name: "陈一", studentId: "20240101", college: "通信工程学院", major: "通信工程", grade: "大一", group: "机械组", status: "approved", submittedAt: "2024-09-01 14:23" },
  { id: 2, name: "刘二", studentId: "20240102", college: "计算机科学学院", major: "计算机科学", grade: "大二", group: "视觉组", status: "approved", submittedAt: "2024-09-02 09:15" },
  { id: 3, name: "杨三", studentId: "20240103", college: "电子科学学院", major: "电子信息", grade: "大一", group: "电控组", status: "pending", submittedAt: "2024-09-03 16:42" },
  { id: 4, name: "黄四", studentId: "20240104", college: "人工智能学院", major: "人工智能", grade: "大二", group: "AI组", status: "pending", submittedAt: "2024-09-04 11:30" },
  { id: 5, name: "林五", studentId: "20240105", college: "软件学院", major: "软件工程", grade: "大三", group: "软件组", status: "approved", submittedAt: "2024-09-05 08:55" },
  { id: 6, name: "何六", studentId: "20240106", college: "通信工程学院", major: "信息工程", grade: "大一", group: "决策组", status: "rejected", submittedAt: "2024-09-06 20:10" },
  { id: 7, name: "马七", studentId: "20240107", college: "新闻学院", major: "广告学", grade: "大二", group: "运营组", status: "pending", submittedAt: "2024-09-07 13:45" },
  { id: 8, name: "高八", studentId: "20240108", college: "机械学院", major: "机械设计", grade: "大一", group: "机械组", status: "approved", submittedAt: "2024-09-08 10:20" },
];

const statusConfig: Record<string, { label: string; class: string }> = {
  pending: { label: "待审核", class: "text-amber-400 bg-amber-500/10" },
  approved: { label: "已通过", class: "text-accent-400 bg-accent-500/10" },
  rejected: { label: "已拒绝", class: "text-rose-400 bg-rose-500/10" },
};

export default function Registrations() {
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = filterStatus === "all"
    ? mockRegistrations
    : mockRegistrations.filter((r) => r.status === filterStatus);

  const pendingCount = mockRegistrations.filter((r) => r.status === "pending").length;
  const approvedCount = mockRegistrations.filter((r) => r.status === "approved").length;
  const rejectedCount = mockRegistrations.filter((r) => r.status === "rejected").length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">报名列表</h1>
          <p className="text-sm text-gray-400 mt-1">查看和管理所有报名申请</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-300 border border-gray-700 hover:bg-white/5 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          导出数据
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="text-2xl font-bold text-amber-400">{pendingCount}</div>
          <div className="text-sm text-gray-400 mt-1">待审核</div>
        </div>
        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="text-2xl font-bold text-accent-400">{approvedCount}</div>
          <div className="text-sm text-gray-400 mt-1">已通过</div>
        </div>
        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="text-2xl font-bold text-rose-400">{rejectedCount}</div>
          <div className="text-sm text-gray-400 mt-1">已拒绝</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 bg-gray-900 rounded-lg w-fit mb-6">
        {[
          { value: "all", label: "全部" },
          { value: "pending", label: "待审核" },
          { value: "approved", label: "已通过" },
          { value: "rejected", label: "已拒绝" },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilterStatus(tab.value)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              filterStatus === tab.value
                ? "bg-gray-800 text-white font-medium"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3.5 text-xs font-medium text-gray-400 uppercase tracking-wider">申请人</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-gray-400 uppercase tracking-wider">学院/专业</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-gray-400 uppercase tracking-wider">年级</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-gray-400 uppercase tracking-wider">意向组别</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-gray-400 uppercase tracking-wider">状态</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-gray-400 uppercase tracking-wider">提交时间</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-gray-400 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map((reg) => {
                const status = statusConfig[reg.status];
                return (
                  <tr key={reg.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      <div>
                        <div className="font-medium text-white">{reg.name}</div>
                        <div className="text-xs text-gray-500">{reg.studentId}</div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-gray-300">{reg.college}</div>
                      <div className="text-xs text-gray-500">{reg.major}</div>
                    </td>
                    <td className="px-5 py-4 text-gray-300">{reg.grade}</td>
                    <td className="px-5 py-4 text-gray-300">{reg.group}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${status.class}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">{reg.submittedAt}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {reg.status === "pending" && (
                          <>
                            <button
                              type="button"
                              className="p-1.5 text-accent-400 hover:bg-accent-500/10 rounded-lg transition-colors"
                              title="通过"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="拒绝"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                          title="查看详情"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-800">
          <span className="text-sm text-gray-400">
            共 {filtered.length} 条记录
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="px-3 py-1.5 text-sm text-gray-400 border border-gray-700 rounded-lg hover:bg-white/5 transition-colors">
              上一页
            </button>
            <button type="button" className="px-3 py-1.5 text-sm text-white bg-primary-500/20 border border-primary-500/30 rounded-lg">
              1
            </button>
            <button type="button" className="px-3 py-1.5 text-sm text-gray-400 border border-gray-700 rounded-lg hover:bg-white/5 transition-colors">
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
