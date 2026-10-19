import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SAFETY, emptySafety, safetyAction, validateSafety } from "./ops.ts";
const row = { id: "I1", name: "SOS", phone: "", zoneId: "Z001", status: "queued" };
test("incident ownership and outcome gate resolution",()=>{let b=emptySafety(); assert.ok(safetyAction(b,row,"a","resolve","done").error); const taken=safetyAction(b,row,"a","take","accepted"); b=taken.book; assert.ok(safetyAction(b,{...row,status:"taken"},"b","resolve","done").error); assert.ok(safetyAction(b,{...row,status:"taken"},"a","resolve","").error); const done=safetyAction(b,{...row,status:"taken"},"a","resolve","safe"); assert.equal(done.status,"resolved"); assert.equal(done.book.incidents.I1.events.length,2);});
test("safety limits validate finite values and relationships",()=>{assert.equal(validateSafety(DEFAULT_SAFETY),undefined); assert.ok(validateSafety({...DEFAULT_SAFETY,dailyHours:25})); assert.ok(validateSafety({...DEFAULT_SAFETY,impossibleTravelMps:NaN})); assert.ok(validateSafety({...DEFAULT_SAFETY,dailyHours:10,weeklyHours:5}));});
// Moved from the old safety/book.ts take/resolve test (C-21): an SOS must be taken before it is resolved.
test("an SOS must be taken before it is resolved",()=>{const sos={...row,id:"INC-1"};assert.ok(safetyAction(emptySafety(),sos,"erik","resolve","safe").error);const taken=safetyAction(emptySafety(),sos,"erik","take","on it");assert.equal(taken.status,"taken");assert.equal(safetyAction(taken.book,{...sos,status:"taken"},"erik","resolve","safe").status,"resolved");});
