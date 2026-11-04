import { redirect } from "react-router";

export function clientLoader() {
  return redirect("/dashboard/admin/recruitment?scope=history");
}

export function meta() {
  return [{ title: "招新管理 | TARSGO" }];
}
