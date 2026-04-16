import { useState } from "react";

export function meta() {
  return [
    { title: "权限分组 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 角色权限管理" },
  ];
}

const pages = [
  { key: "dashboard", label: "主页" },
  { key: "users", label: "用户数据" },
  { key: "user-groups", label: "用户分组" },
  { key: "form-config", label: "表单配置" },
  { key: "registrations", label: "报名列表" },
  { key: "permission-groups", label: "权限分组" },
];

const mockRoles = [
  {
    id: 1,
    name: "超级管理员",
    description: "拥有所有权限，可管理其他管理员",
    color: "rose",
    memberCount: 1,
    permissions: ["dashboard", "users", "user-groups", "form-config", "registrations", "permission-groups"],
  },
  {
    id: 2,
    name: "管理员",
    description: "可管理用户、分组及报名相关功能",
    color: "primary",
    memberCount: 3,
    permissions: ["dashboard", "users", "user-groups", "form-config", "registrations"],
  },
  {
    id: 3,
    name: "组长",
    description: "可查看用户数据与报名列表",
    color: "amber",
    memberCount: 7,
    permissions: ["dashboard", "users", "registrations"],
  },
  {
    id: 4,
    name: "成员",
    description: "仅可访问主页",
    color: "sky",
    memberCount: 20,
    permissions: ["dashboard"],
  },
];

const colorMap: Record<string, { border: string; bg: string; text: string; tag: string; dot: string }> = {
  rose: { border: "border-rose-500/30", bg: "bg-rose-500/10", text: "text-rose-400", tag: "bg-rose-500/15 text-rose-300", dot: "bg-rose-400" },
  primary: { border: "border-primary-500/30", bg: "bg-primary-500/10", text: "text-primary-400", tag: "bg-primary-500/15 text-primary-300", dot: "bg-primary-400" },
  amber: { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-400", tag: "bg-amber-500/15 text-amber-300", dot: "bg-amber-400" },
  sky: { border: "border-sky-500/30", bg: "bg-sky-500/10", text: "text-sky-400", tag: "bg-sky-500/15 text-sky-300", dot: "bg-sky-400" },
};

export default function PermissionGroups() {
  const [roles, setRoles] = useState(mockRoles);
  const [editingId, setEditingId] = useState<number | null>(null);

  function togglePermission(roleId: number, pageKey: string) {
    setRoles((prev) =>
      prev.map((role) => {
        if (role.id !== roleId) return role;
        const has = role.permissions.includes(pageKey);
        return {
          ...role,
          permissions: has
            ? role.permissions.filter((p) => p !== pageKey)
            : [...role.permissions, pageKey],
        };
      })
    );
  }

  return (
    <div>
      <div className="motion-fade-up flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">权限分组</h1>
          <p className="text-sm text-gray-400 mt-1">管理角色与页面级访问权限</p>
        </div>
        <button
          type="button"
          className="motion-button inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          新建角色
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="motion-stat-surface p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="text-2xl font-bold text-white">{roles.length}</div>
          <div className="text-sm text-gray-400 mt-1">角色总数</div>
        </div>
        <div className="motion-stat-surface p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="text-2xl font-bold text-white">{pages.length}</div>
          <div className="text-sm text-gray-400 mt-1">权限项数</div>
        </div>
        <div className="motion-stat-surface p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="text-2xl font-bold text-white">{roles.reduce((sum, r) => sum + r.memberCount, 0)}</div>
          <div className="text-sm text-gray-400 mt-1">总关联用户</div>
        </div>
        <div className="motion-stat-surface p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="text-2xl font-bold text-white">{roles.filter((r) => r.permissions.length === pages.length).length}</div>
          <div className="text-sm text-gray-400 mt-1">满权限角色</div>
        </div>
      </div>

      {/* Role cards */}
      <div className="space-y-4">
        {roles.map((role) => {
          const colors = colorMap[role.color];
          const isEditing = editingId === role.id;

          return (
            <div
              key={role.id}
              className={`motion-surface rounded-xl bg-gray-900 border transition-colors ${isEditing ? colors.border : "border-gray-800"}`}
            >
              {/* Role header */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${colors.dot}`} />
                  <div>
                    <h3 className={`text-base font-semibold ${colors.text}`}>{role.name}</h3>
                    <p className="text-sm text-gray-400 mt-0.5">{role.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colors.tag}`}>
                    {role.memberCount} 人
                  </span>
                  <span className="text-xs text-gray-500">
                    {role.permissions.length}/{pages.length} 权限
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : role.id)}
                    className={`motion-button px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      isEditing
                        ? "text-primary-400 border-primary-500/30 bg-primary-500/10"
                        : "text-gray-400 border-gray-700 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {isEditing ? "完成" : "编辑"}
                  </button>
                </div>
              </div>

              {/* Permissions grid */}
              <div className="px-5 pb-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {pages.map((page) => {
                    const hasPermission = role.permissions.includes(page.key);
                    return (
                      <button
                        key={page.key}
                        type="button"
                        disabled={!isEditing}
                        onClick={() => togglePermission(role.id, page.key)}
                        className={`motion-button flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          hasPermission
                            ? `${colors.bg} ${colors.text} ${isEditing ? `border ${colors.border}` : ""}`
                            : `bg-gray-800/50 text-gray-500 ${isEditing ? "border border-gray-700 hover:bg-gray-800" : ""}`
                        } ${isEditing ? "cursor-pointer" : "cursor-default"}`}
                      >
                        {hasPermission ? (
                          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        )}
                        <span className="truncate">{page.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
