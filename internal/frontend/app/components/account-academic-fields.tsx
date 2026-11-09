import { useEffect, useId, useState } from "react";
import { inferGrade, updateAcademicStudentId, type AcademicInput } from "~/lib/account-profile";
import { leaveClient, type CollegeOption } from "~/lib/leave-client";

export function AccountAcademicFields({ value, onChange, disabled = false, fieldClass = "auth-input", labelClass = "block text-sm" }: {
  value: AcademicInput; onChange: (next: AcademicInput) => void; disabled?: boolean; fieldClass?: string; labelClass?: string;
}) {
  const id = useId();
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  useEffect(() => { let active = true; void leaveClient.colleges().then((rows) => { if (active) setColleges(rows); }).catch(() => {}); return () => { active = false; }; }, []);
  const grade = inferGrade(value.studentId);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1949 }, (_, i) => `${currentYear - i} 级`);
  return <fieldset disabled={disabled} className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
    <label className="block min-w-0 sm:col-span-2">
      <span className={labelClass}>是否在校学生</span>
      <select aria-label="是否在校学生" className={fieldClass} required value={value.isStudent === null ? "" : String(value.isStudent)} onChange={(e) => onChange({ ...value, isStudent: e.target.value === "" ? null : e.target.value === "true" })}>
        <option value="">请选择</option><option value="true">是</option><option value="false">否</option>
      </select>
    </label>
    {value.isStudent ? <>
      <label className="block min-w-0"><span className={labelClass}>学号</span>
        <input aria-label="学号" className={fieldClass} required maxLength={40} pattern="[A-Za-z0-9]+" autoComplete="off" value={value.studentId} onChange={(e) => onChange(updateAcademicStudentId(value, e.target.value))} />
      </label>
      <label className="block min-w-0"><span className={labelClass}>学院</span>
        <input aria-label="学院" className={fieldClass} required maxLength={100} list={`${id}-colleges`} value={value.college} onChange={(e) => onChange({ ...value, college: e.target.value })} />
        <datalist id={`${id}-colleges`}>{colleges.map((c) => <option key={c.code} value={c.name} />)}</datalist>
      </label>
      <label className="block min-w-0"><span className={labelClass}>年级</span>
        {grade ? <input className={fieldClass} aria-label="年级" value={grade} readOnly /> : <select aria-label="年级" className={fieldClass} required value={value.grade} onChange={(e) => onChange({ ...value, grade: e.target.value })}>
          <option value="">请选择入学年份</option>
          {value.grade && !years.includes(value.grade) ? <option value={value.grade}>{value.grade}</option> : null}
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>}
      </label>
    </> : null}
  </fieldset>;
}
