/**
 * Duplicate-safe Fex Studio Google Sheets receiver.
 * Copy into the Apps Script project attached to the LEX IELTS Student Result spreadsheet.
 */
const SHEET_TABS={IELTS:'Sheet1',WRITING:'Writing Submissions'};
function getOrCreateSheet(ss,name,headers){let s=ss.getSheetByName(name);if(!s){s=ss.insertSheet(name);if(headers?.length){s.getRange(1,1,1,headers.length).setValues([headers]);s.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#FAF9F6').setFontColor('#1A1A1A');s.setFrozenRows(1);}}return s;}
function output(body){return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);}
function findSubmissionId(sheet,id,col){if(!id||sheet.getLastRow()<2)return false;const values=sheet.getRange(2,col,sheet.getLastRow()-1,1).getDisplayValues();return values.some(r=>String(r[0]).trim()===id);}
function doPost(e){
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(15000))return output({ok:false,error:'Receiver is busy; retry later.'});
 try{
  const ss=SpreadsheetApp.getActiveSpreadsheet(),payload=JSON.parse(e.postData.contents||'{}'),timestamp=new Date().toISOString(),id=String(payload.submissionId||'').trim();
  if(!id)return output({ok:false,error:'Missing submissionId'});
  if(payload.action==='log_writing'){
   const headers=['Timestamp','Submission ID','Student Name','Student Email','Task Type','Prompt Title','Word Count','Time Spent','Essay Text','Status'];
   const sheet=getOrCreateSheet(ss,SHEET_TABS.WRITING,headers);
   if(findSubmissionId(sheet,id,2))return output({ok:true,submissionId:id,duplicate:true});
   sheet.appendRow([timestamp,id,payload.studentName||'',payload.studentEmail||'',payload.taskType||'Task 2',payload.promptTitle||'',Number(payload.wordCount||0),payload.timeSpent||'Untimed',payload.essayText||'','Submitted']);
   return output({ok:true,submissionId:id});
  }
  const sheet=ss.getSheets()[0];
  // Column G stores stable backup IDs; the legacy six columns are preserved.
  if(sheet.getLastColumn()<7)sheet.getRange(1,7).setValue('Submission ID');
  else if(!String(sheet.getRange(1,7).getDisplayValue()).trim())sheet.getRange(1,7).setValue('Submission ID');
  if(findSubmissionId(sheet,id,7))return output({ok:true,submissionId:id,duplicate:true});
  sheet.appendRow([timestamp,payload.studentName||payload.name||'',payload.studentEmail||payload.email||'',payload.module||payload.category||'IELTS Practice',payload.score||'',payload.details||JSON.stringify(payload),id]);
  return output({ok:true,submissionId:id});
 }catch(err){return output({ok:false,error:String(err.message||err)});}
 finally{lock.releaseLock();}
}
function doGet(e){try{const ss=SpreadsheetApp.getActiveSpreadsheet(),action=e?.parameter?.action||'teacher_dashboard';if(action!=='teacher_dashboard')return output({ok:false,error:'Unknown action: '+action});
 const parseSheet=sheet=>{if(!sheet||sheet.getLastRow()<2)return[];const data=sheet.getDataRange().getValues(),headers=data[0].map(h=>String(h).trim());return data.slice(1).map((row,i)=>{const o={_row:i+2};headers.forEach((h,j)=>o[h]=row[j]);return o;}).reverse();};
 return output({ok:true,generatedAt:new Date().toISOString(),ieltsResults:parseSheet(ss.getSheets()[0]),writingSubmissions:parseSheet(ss.getSheetByName(SHEET_TABS.WRITING))});
 }catch(err){return output({ok:false,error:String(err.message||err)});}}
