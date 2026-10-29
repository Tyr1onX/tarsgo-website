import {apiRequest} from "./api-client";

export type PracticeEntryStatus="active"|"exit_pending"|"exited";
export type PracticeDecision="pending"|"passed"|"needs_redo";
export interface PracticeGroup{groupId:number;name:string}
export interface PracticeFile{id:number;fileName:string;size:number}
export interface PracticeSubmission{
 id:number;userId:number;attempt:number;progress:string;reflection:string;decision:PracticeDecision;comment:string;
 score?:number;createdAt:string;files:PracticeFile[];
}
export interface PracticeMember{userId:number;name:string;status:PracticeEntryStatus;joinedAt:string;submissions:PracticeSubmission[]}
export interface PracticeProject{
 id:number;groupId:number;title:string;description:string;capacity:number;dueAt:string;status:"open"|"closed";
 occupiedCount:number;myStatus?:PracticeEntryStatus;members:PracticeMember[];
}
export interface PracticeInput{groupId:number;title:string;description:string;capacity:number;dueAt:string}
const memberRoot="/api/practice-projects";
const managerRoot="/api/admin/practice-projects";
export const practiceClient={
 groups:()=>apiRequest<PracticeGroup[]>(managerRoot+"/groups"),
 memberList:()=>apiRequest<PracticeProject[]>(memberRoot),
 adminList:()=>apiRequest<PracticeProject[]>(managerRoot),
 get:(id:number)=>apiRequest<PracticeProject>(`${memberRoot}/${id}`),
 create:(v:PracticeInput)=>apiRequest<PracticeProject>(managerRoot,{method:"POST",body:v}),
 edit:(id:number,v:PracticeInput)=>apiRequest<PracticeProject>(`${managerRoot}/${id}`,{method:"PUT",body:v}),
 close:(id:number)=>apiRequest<PracticeProject>(`${managerRoot}/${id}/close`,{method:"POST"}),
 join:(id:number)=>apiRequest<PracticeProject>(`${memberRoot}/${id}/join`,{method:"POST"}),
 exit:(id:number)=>apiRequest<PracticeProject>(`${memberRoot}/${id}/exit`,{method:"POST"}),
 decideExit:(id:number,userId:number,approve:boolean)=>apiRequest<PracticeProject>(`${managerRoot}/${id}/members/${userId}/exit`,{method:"POST",body:{approve}}),
 submit:(id:number,form:FormData)=>apiRequest<PracticeProject>(`${memberRoot}/${id}/submissions`,{method:"POST",body:form}),
 review:(id:number,subId:number,decision:"passed"|"needs_redo",score:number,comment:string)=>apiRequest<PracticeProject>(`${managerRoot}/${id}/submissions/${subId}/review`,{method:"POST",body:{decision,score,comment}}),
 fileUrl:(id:number)=>`/api/practice-files/${id}`
};
