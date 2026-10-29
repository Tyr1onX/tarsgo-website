import assert from "node:assert/strict";
import test from "node:test";
import { coursesForWeek } from "./timetable-client.ts";

const courses = [
 { name:"单周课",weekday:1,startSection:1,endSection:2,weeks:[1,2,3],parity:"odd" },
 { name:"双周课",weekday:2,startSection:3,endSection:4,weeks:[1,2,3],parity:"even" },
 { name:"调课后时段",weekday:4,startSection:11,endSection:12,weeks:[6],parity:"all" },
 { name:"正常课程",weekday:3,startSection:3,endSection:4,weeks:[4,5,6],parity:"all" },
];
test("personal timetable only displays courses active in the selected teaching week",()=>{
 assert.deepEqual(coursesForWeek(courses,1).map(c=>c.name),["单周课"]);
 assert.deepEqual(coursesForWeek(courses,2).map(c=>c.name),["双周课"]);
 assert.deepEqual(coursesForWeek(courses,6).map(c=>c.name),["调课后时段","正常课程"]);
 assert.deepEqual(coursesForWeek(courses,0),[]);
 assert.deepEqual(coursesForWeek(courses,18),[]);
});
