import { apiRequest } from "./api-client.ts";

export interface AvailabilityGroup {groupId:number;name:string;semesters:string[]}
export interface AvailabilityOptions {groups:AvailabilityGroup[]}
export interface AvailabilityFilter {groupId:number;semester:string;week:number;weekday:number;startSection:number;endSection:number}
export type AvailabilityStatus="free"|"conflict"|"missing";
export interface AvailabilityMember {
 userId:number;
 name:string;
 status:AvailabilityStatus;
 missingReason?:"not_imported"|"semester_mismatch"|"invalid_data";
 hasUncertainCourses:boolean;
 uncertainCourseCount:number;
}
export interface AvailabilityResult extends AvailabilityFilter {
 groupName:string;
 totalCount:number;
 importedCount:number;
 freeCount:number;
 conflictCount:number;
 missingCount:number;
 members:AvailabilityMember[];
}
export function getAvailabilityOptions(){return apiRequest<AvailabilityOptions>("/api/admin/timetable-availability/options")}
export function analyzeAvailability(input:AvailabilityFilter){
 const params=new URLSearchParams(Object.entries(input).map(([key,value])=>[key,String(value)]));
 return apiRequest<AvailabilityResult>(`/api/admin/timetable-availability?${params.toString()}`);
}
