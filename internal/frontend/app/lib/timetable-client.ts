import { apiRequest } from "./api-client.ts";

export interface TimetableCourse {
 code?: string;
 name: string;
 weekday: number;
 startSection: number;
 endSection: number;
 weeks: number[];
 parity: "all" | "odd" | "even";
 location?: string;
}
export interface TimetableNote { name: string; reason: string }
export interface PersonalTimetable {
 semester: string;
 courses: TimetableCourse[];
 notes: TimetableNote[];
 maxWeek: number;
 updatedAt: string;
}

export function getPersonalTimetables() {
 return apiRequest<PersonalTimetable[]>("/api/my-timetables");
}

export function importPersonalTimetable(semester: string, file: File) {
 const body = new FormData();
 body.append("semester", semester);
 body.append("file", file);
 return apiRequest<PersonalTimetable>("/api/my-timetables", {method:"POST",body});
}
