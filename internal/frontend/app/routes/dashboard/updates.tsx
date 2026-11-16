import { redirect } from "react-router";

export function clientLoader() {
  return redirect("/dashboard/guide");
}

export function meta() {
  return [{ title: "工作手册 | TARSGO" }];
}
