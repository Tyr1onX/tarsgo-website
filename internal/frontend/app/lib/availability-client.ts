import { apiRequest } from "./api-client.ts";

export interface AvailabilityGroup {groupId:number;name:string;semesters:string[]}
export interface AvailabilityOptions {groups:AvailabilityGroup[]}
export type AvailabilityStatus="free"|"conflict"|"missing";
export type MissingReason = "not_imported" | "semester_mismatch" | "invalid_data" | "uncertain_courses";
export interface WeekSlot { weekday: number; startSection: number; endSection: number }
export interface WeekMember {
 userId:number; name:string; missingReason?:MissingReason;
 hasUncertainCourses:boolean; uncertainCourseCount:number; occupied:WeekSlot[];
}
export interface AvailabilityWeek {
 groupId:number; groupName:string; semester:string; week:number;
 totalCount:number; importedCount:number; missingCount:number; members:WeekMember[];
}
export function getAvailabilityWeek(input:{groupId:number;semester:string;week:number}){
 const params=new URLSearchParams(Object.entries(input).map(([key,value])=>[key,String(value)]));
 return apiRequest<AvailabilityWeek>(`/api/admin/timetable-availability/week?${params}`);
}
export function intervalStatus(member:WeekMember,weekday:number,startSection:number,endSection:number):AvailabilityStatus{
 if(member.missingReason)return "missing";
 return member.occupied.some(slot=>slot.weekday===weekday&&slot.startSection<=endSection&&slot.endSection>=startSection)?"conflict":"free";
}
export function availabilityCounts(members:WeekMember[],weekday:number,startSection:number,endSection:number){
 return members.reduce((counts,member)=>{
  counts[intervalStatus(member,weekday,startSection,endSection)]++;
  return counts;
 },{free:0,conflict:0,missing:0});
}
export function availabilityFreeRatio(members:WeekMember[],weekday:number,startSection:number,endSection:number):number|null{
 const {free,conflict}=availabilityCounts(members,weekday,startSection,endSection);
 const validCount=free+conflict;
 return validCount===0?null:free/validCount;
}
export function filterAvailabilityMembers(members:WeekMember[],weekday:number,startSection:number,endSection:number,status:AvailabilityStatus){
 return members.filter(member=>intervalStatus(member,weekday,startSection,endSection)===status);
}
export function getAvailabilityOptions(){return apiRequest<AvailabilityOptions>("/api/admin/timetable-availability/options")}
